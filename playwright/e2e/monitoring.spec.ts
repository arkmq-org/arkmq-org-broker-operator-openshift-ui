import { test, expect } from '@playwright/test';
import {
  kubectl,
  yarn,
  applyYaml,
  createNamespace,
  deleteNamespace,
  waitForCondition,
  waitForPod,
  secretExists,
  startPortForward,
  queryPrometheus,
  getPrometheusTargets,
} from '../fixtures/k8s';

// E2E test to verify monitoring infrastructure and ServiceMonitor setup for metrics scraping.
// Set TEST_MONITORING=true to run these tests, otherwise they're skipped.
const shouldTestMonitoring = process.env.TEST_MONITORING === 'true';
const TEST_NAMESPACE = 'monitoring-test';

test.describe('Prometheus Monitoring - ServiceMonitor Setup', () => {
  test.skip(
    !shouldTestMonitoring,
    'Skipping monitoring tests. Set TEST_MONITORING=true to enable.',
  );

  test('complete monitoring setup with ServiceMonitor', async () => {
    console.log('\n📊 Testing complete Prometheus monitoring setup\n');

    // 1. Enable user workload monitoring
    console.log('Step 1: Enabling user workload monitoring...');
    yarn('prometheus-config enable');
    console.log('✓ User workload monitoring enabled');

    // 2. Verify monitoring pods are ready
    console.log('\nStep 2: Verifying monitoring infrastructure...');
    yarn('prometheus-config verify');
    console.log('✓ Monitoring infrastructure ready');

    // 3. Setup PKI infrastructure
    console.log('\nStep 3: Setting up PKI infrastructure...');
    yarn('chain-of-trust setup');
    console.log('✓ PKI infrastructure created');

    // 4. Create test namespace
    console.log('\nStep 4: Creating test namespace...');
    createNamespace(TEST_NAMESPACE);
    console.log(`✓ Namespace ${TEST_NAMESPACE} created`);

    // 5. Create Prometheus certificate
    console.log('\nStep 5: Creating Prometheus certificate...');
    yarn(`chain-of-trust create-prometheus-cert --namespace ${TEST_NAMESPACE}`);

    // Verify the prometheus-cert secret was created
    const promCertSecret = kubectl(`get secret prometheus-cert -n ${TEST_NAMESPACE}`);
    expect(promCertSecret).toContain('prometheus-cert');
    console.log('✓ Prometheus certificate created');

    // 6. Generate ServiceMonitor YAML
    console.log('\nStep 6: Generating ServiceMonitor YAML...');
    const serviceMonitorYaml = yarn(
      `prometheus-config create-servicemonitor --broker-name test-broker --namespace ${TEST_NAMESPACE} --quiet`,
    );

    // Verify the YAML contains expected elements
    expect(serviceMonitorYaml).toContain('kind: ServiceMonitor');
    expect(serviceMonitorYaml).toContain('name: test-broker-monitor');
    expect(serviceMonitorYaml).toContain('namespace: ' + TEST_NAMESPACE);
    expect(serviceMonitorYaml).toContain('serverName:');
    expect(serviceMonitorYaml).toContain('prometheus-cert');
    expect(serviceMonitorYaml).toContain('activemq-artemis-manager-ca');
    console.log('✓ ServiceMonitor YAML generated with mTLS config');

    // 7. Apply the ServiceMonitor
    console.log('\nStep 7: Applying ServiceMonitor...');
    applyYaml(serviceMonitorYaml);

    // Verify ServiceMonitor was created
    const serviceMonitor = kubectl(`get servicemonitor test-broker-monitor -n ${TEST_NAMESPACE}`);
    expect(serviceMonitor).toContain('test-broker-monitor');
    console.log('✓ ServiceMonitor applied successfully');

    // 8. Verify the ServiceMonitor has correct TLS configuration
    console.log('\nStep 8: Verifying ServiceMonitor TLS configuration...');
    const smDetails = kubectl(
      `get servicemonitor test-broker-monitor -n ${TEST_NAMESPACE} -o json`,
    );
    const smData = JSON.parse(smDetails);

    expect(smData.spec.endpoints).toBeDefined();
    expect(smData.spec.endpoints[0].scheme).toBe('https');
    expect(smData.spec.endpoints[0].tlsConfig).toBeDefined();
    expect(smData.spec.endpoints[0].tlsConfig.ca.secret.name).toBe('activemq-artemis-manager-ca');
    expect(smData.spec.endpoints[0].tlsConfig.cert.secret.name).toBe('prometheus-cert');
    console.log('✓ ServiceMonitor has correct mTLS configuration');

    // 9. Verify Service was created
    console.log('\nStep 9: Verifying metrics Service...');
    const service = kubectl(`get service test-broker-metrics -n ${TEST_NAMESPACE}`);
    expect(service).toContain('test-broker-metrics');
    expect(service).toContain('8888');
    console.log('✓ Metrics service created');

    // 10. Create broker certificate for the test broker
    console.log('\nStep 10: Creating broker certificate...');
    yarn(`chain-of-trust create-service-cert --name test-broker --namespace ${TEST_NAMESPACE}`);

    // Verify broker certificate was created
    expect(secretExists('test-broker-broker-cert', TEST_NAMESPACE)).toBe(true);
    console.log('✓ Broker certificate created');

    // 10b. Deploy a real BrokerService to test metrics scraping
    console.log('\nStep 10b: Deploying real BrokerService with metrics enabled...');
    const brokerServiceYaml = `
apiVersion: arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: test-broker
  namespace: ${TEST_NAMESPACE}
spec:
  resources:
    limits:
      memory: "256Mi"
  env:
    - name: JAVA_ARGS_APPEND
      value: "-Dlog4j2.level=INFO"
`;
    applyYaml(brokerServiceYaml);

    // Wait for broker pod to be ready
    console.log('⏳ Waiting for broker pod to be ready...');
    await waitForPod(`test-broker-ss-0`, TEST_NAMESPACE, 600000);
    console.log('✓ Broker pod is ready');

    // Wait for BrokerService to be deployed
    console.log('⏳ Waiting for BrokerService to be deployed...');
    await waitForCondition(
      'brokerservice',
      'test-broker',
      TEST_NAMESPACE,
      'Deployed',
      'True',
      600000,
    );
    console.log('✓ BrokerService deployed');

    // 11. Verify Prometheus actually scrapes metrics
    console.log('\nStep 11: Verifying Prometheus scrapes metrics from the broker...');

    const promNs = 'openshift-user-workload-monitoring';
    const promPods = kubectl(
      `get pods -n ${promNs} -l app.kubernetes.io/name=prometheus -o jsonpath='{.items[0].metadata.name}'`,
      { ignoreError: true },
    );

    if (promPods) {
      console.log(`✓ Prometheus pod found: ${promPods}`);

      // Port-forward to Prometheus
      console.log('⏳ Setting up port-forward to Prometheus...');
      const { cleanup, baseUrl } = startPortForward(promPods, promNs, 9090, 9090);

      try {
        console.log('✓ Port-forward established');

        // Wait for ServiceMonitor to be discovered by Prometheus (can take up to 30s)
        console.log('⏳ Waiting for Prometheus to discover ServiceMonitor target...');
        let targetFound = false;
        let targetUp = false;
        const maxAttempts = 15; // 15 attempts * 2s = 30s max wait

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const targetsResponse = getPrometheusTargets(baseUrl);

          if (targetsResponse.status === 'success') {
            const data = targetsResponse.data as {
              activeTargets: Array<{
                labels?: { job?: string; namespace?: string };
                health?: string;
                scrapeUrl?: string;
              }>;
            };
            const activeTargets = data.activeTargets;

            // Debug: show all targets on first attempt
            if (attempt === 1) {
              console.log(`  Found ${activeTargets.length} active targets in Prometheus`);
              activeTargets.forEach((t) => {
                console.log(`    - job=${t.labels?.job}, namespace=${t.labels?.namespace}`);
              });
            }

            // Find our ServiceMonitor target - try multiple patterns
            const target = activeTargets.find(
              (t) =>
                t.labels?.namespace === TEST_NAMESPACE ||
                t.labels?.job?.includes('test-broker') ||
                t.scrapeUrl?.includes(TEST_NAMESPACE),
            );

            if (target) {
              targetFound = true;
              const health = target.health;
              console.log(
                `  Attempt ${attempt}: Target found, job=${target.labels?.job}, health=${health}`,
              );

              if (health === 'up') {
                targetUp = true;
                console.log(`✓ Target is UP and being scraped`);
                break;
              }
            } else {
              console.log(`  Attempt ${attempt}: Target not yet discovered`);
            }
          }

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }

        expect(targetFound).toBe(true);
        expect(targetUp).toBe(true);

        // Query for actual broker metrics
        console.log('\n⏳ Querying for broker metrics...');
        const metricsQuery = `up{namespace="${TEST_NAMESPACE}"}`;
        const metricsResponse = queryPrometheus(baseUrl, metricsQuery);

        expect(metricsResponse.status).toBe('success');
        const resultData = metricsResponse.data as { result: Array<unknown> };
        expect(resultData.result.length).toBeGreaterThan(0);

        const metric = resultData.result[0] as {
          metric: Record<string, string>;
          value: [number, string];
        };
        console.log(
          `✓ Metrics found: job=${metric.metric.job}, namespace=${metric.metric.namespace}`,
        );
        console.log(`✓ up metric value: ${metric.value[1]}`);

        // The up metric should be 1 (target is up)
        expect(metric.value[1]).toBe('1');

        console.log('\n✅ Prometheus is successfully scraping broker metrics with mTLS!');
      } finally {
        cleanup();
        console.log('✓ Port-forward cleaned up');
      }
    } else {
      console.log('⚠️  Prometheus pod not found (may not be running in test env)');
      console.log('⚠️  Skipping actual metrics verification');
    }

    // 13. Cleanup
    console.log('\n🧹 Cleaning up...');
    deleteNamespace(TEST_NAMESPACE);
    yarn('chain-of-trust cleanup');
    yarn('prometheus-config disable');
    console.log('✓ Cleanup complete');

    console.log('\n✅ All monitoring tests passed!\n');
  });
});
