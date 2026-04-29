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
} from '../fixtures/k8s';

// Prometheus API response types
interface PrometheusTarget {
  labels?: { job?: string; namespace?: string };
  health?: string;
  scrapeUrl?: string;
  lastError?: string;
}

interface PrometheusTargetsResponse {
  status: string;
  data?: {
    activeTargets: PrometheusTarget[];
  };
  error?: string;
}

interface PrometheusQueryResponse {
  status: string;
  data?: {
    result: Array<{
      metric: Record<string, string>;
      value: [number, string];
    }>;
  };
  error?: string;
}

/**
 * Query Prometheus API by exec'ing into the Prometheus pod
 */
function queryPrometheusViaPod(promNs: string, query: string): PrometheusQueryResponse {
  const encodedQuery = encodeURIComponent(query);
  const promUrl = `http://localhost:9090/api/v1/query?query=${encodedQuery}`;

  const result = kubectl(
    `exec -n ${promNs} prometheus-user-workload-0 -c prometheus -- curl -s '${promUrl}' --max-time 10`,
    { timeout: 30000, ignoreError: true },
  );

  if (!result) {
    return { status: 'error', error: 'No response from Prometheus' };
  }

  try {
    return JSON.parse(result) as PrometheusQueryResponse;
  } catch {
    return { status: 'error', error: 'Invalid JSON response' };
  }
}

/**
 * Get Prometheus targets by exec'ing into the Prometheus pod
 */
function getPrometheusTargetsViaPod(promNs: string): PrometheusTargetsResponse {
  const promUrl = `http://localhost:9090/api/v1/targets`;

  const result = kubectl(
    `exec -n ${promNs} prometheus-user-workload-0 -c prometheus -- curl -s '${promUrl}' --max-time 10`,
    { timeout: 30000, ignoreError: true },
  );

  if (!result) {
    return { status: 'error', error: 'No response from Prometheus' };
  }

  try {
    return JSON.parse(result) as PrometheusTargetsResponse;
  } catch {
    return { status: 'error', error: 'Invalid JSON response' };
  }
}

// E2E test to verify monitoring infrastructure and ServiceMonitor setup for metrics scraping.
// Set TEST_MONITORING=true to run these tests, otherwise they're skipped.
const shouldTestMonitoring = process.env.TEST_MONITORING === 'true';
const TEST_NAMESPACE = 'monitoring-test';

test.describe('Prometheus Monitoring - ServiceMonitor Setup', () => {
  test.skip(
    !shouldTestMonitoring,
    'Skipping monitoring tests. Set TEST_MONITORING=true to enable.',
  );

  test.afterAll(async () => {
    // Cleanup test namespace and infrastructure
    console.log('\n🧹 Cleaning up...');
    deleteNamespace(TEST_NAMESPACE);
    yarn('chain-of-trust cleanup');
    yarn('prometheus-config disable');
    console.log('✓ Cleanup complete');

    console.log('\n✅ E2E Tests Complete\n');
  });

  test('complete monitoring setup with ServiceMonitor', async () => {
    console.log('\n📊 Testing complete Prometheus monitoring setup\n');

    // Enable user workload monitoring
    console.log('Step 1: Enabling user workload monitoring...');
    yarn('prometheus-config enable');
    console.log('✓ User workload monitoring enabled');

    // Verify monitoring pods are ready
    console.log('\nStep 2: Verifying monitoring infrastructure...');
    yarn('prometheus-config verify', { timeout: 360000 });
    console.log('✓ Monitoring infrastructure ready');

    // Setup PKI infrastructure
    console.log('\nStep 3: Setting up PKI infrastructure...');
    yarn('chain-of-trust setup');
    console.log('✓ PKI infrastructure created');

    // Create test namespace
    console.log('\nStep 4: Creating test namespace...');
    createNamespace(TEST_NAMESPACE);
    console.log(`✓ Namespace ${TEST_NAMESPACE} created`);
    //
    // Create broker certificate for the test broker
    console.log('\nStep 5: Creating broker certificate...');
    yarn(`chain-of-trust create-service-cert --name test-broker --namespace ${TEST_NAMESPACE}`);

    // Verify broker certificate was created
    expect(secretExists('test-broker-broker-cert', TEST_NAMESPACE)).toBe(true);
    console.log('✓ Broker certificate created');

    // Deploy a real BrokerService to test metrics scraping
    console.log('\nStep 6: Deploying real BrokerService with metrics enabled...');
    const brokerServiceYaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: test-broker
  namespace: ${TEST_NAMESPACE}
  labels:
    forWorkQueue: "true"
spec:
  resources:
    limits:
      memory: "256Mi"
  env:
    - name: JAVA_ARGS_APPEND
      value: "-Dlog4j2.level=INFO"
`;
    applyYaml(brokerServiceYaml);

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

    // Wait for broker pod to be ready
    console.log('⏳ Waiting for broker pod to be ready...');
    await waitForPod(`test-broker-ss-0`, TEST_NAMESPACE, 600000);
    console.log('✓ Broker pod is ready');

    // Deploy BrokerApp to create queues (ensures metrics are exported)
    console.log('\nStep 6a: Creating BrokerApp certificate...');
    yarn(`chain-of-trust create-app-cert --name test-app --namespace ${TEST_NAMESPACE}`);
    expect(secretExists('test-app-app-cert', TEST_NAMESPACE)).toBe(true);
    console.log('✓ BrokerApp certificate created');

    console.log('\nStep 6b: Deploying BrokerApp to create queues...');
    const brokerAppYaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerApp
metadata:
  name: test-app
  namespace: ${TEST_NAMESPACE}
spec:
  selector:
    matchLabels:
      forWorkQueue: "true"
  acceptor:
    port: 61616
  capabilities:
  - consumerOf:
    - address: "APP.JOBS"
  - producerOf:
    - address: "APP.JOBS"
`;
    applyYaml(brokerAppYaml);

    console.log('\nStep 6c: Waiting for BrokerApp to be provisioned...');
    await waitForCondition('brokerapp', 'test-app', TEST_NAMESPACE, 'Deployed', 'True', 300000);
    console.log('✓ BrokerApp deployed - queues created and metrics exported');

    // Create Prometheus certificate
    console.log('\nStep 7: Creating Prometheus certificate...');
    yarn(`chain-of-trust create-prometheus-cert --namespace ${TEST_NAMESPACE}`);

    // Wait for cert-manager to provision the certificate
    console.log('⏳ Waiting for Prometheus certificate to be ready...');
    kubectl(
      `wait --for=condition=Ready certificate/prometheus-cert -n ${TEST_NAMESPACE} --timeout=60s`,
    );
    console.log('✓ Prometheus certificate ready');

    // Setup complete monitoring stack (Service + ServiceMonitor + namespace label)
    console.log('\nStep 8: Setting up monitoring stack...');
    yarn(
      `prometheus-config setup-monitoring --broker-name test-broker --namespace ${TEST_NAMESPACE}`,
    );

    // Verify resources were created
    const serviceMonitor = kubectl(`get servicemonitor test-broker-monitor -n ${TEST_NAMESPACE}`);
    expect(serviceMonitor).toContain('test-broker-monitor');
    const metricsService = kubectl(`get service test-broker-metrics -n ${TEST_NAMESPACE}`);
    expect(metricsService).toContain('test-broker-metrics');
    console.log('✓ Monitoring stack created (Service + ServiceMonitor)');

    // Wait a bit for Prometheus to reload config and discover the ServiceMonitor
    console.log('⏳ Waiting for Prometheus to reload configuration...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log('✓ Configuration reload complete');

    // 9. Verify Prometheus actually scrapes metrics
    console.log('\nStep 9: Verifying Prometheus scrapes metrics from the broker...');

    const promNs = 'openshift-user-workload-monitoring';
    const promService = 'prometheus-operated';

    // Verify Prometheus service exists
    const promSvc = kubectl(`get service ${promService} -n ${promNs} -o name`, {
      ignoreError: true,
    });
    expect(promSvc).toBeTruthy();
    expect(promSvc.length).toBeGreaterThan(0);
    console.log(`✓ Prometheus service found: ${promService}`);

    console.log('⏳ Querying Prometheus via ephemeral curl pod...');

    // Wait for ServiceMonitor to be discovered by Prometheus (can take up to 90s for certs to propagate + mTLS handshake)
    console.log('⏳ Waiting for Prometheus to discover ServiceMonitor target...');
    let targetFound = false;
    let targetUp = false;
    const maxAttempts = 45; // 45 attempts * 2s = 90s max wait

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const targetsResponse = getPrometheusTargetsViaPod(promNs);

      if (targetsResponse.status === 'success' && targetsResponse.data) {
        const activeTargets = targetsResponse.data.activeTargets;

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
          const lastError = target.lastError || 'no error message';
          console.log(
            `  Attempt ${attempt}: Target found, job=${target.labels?.job}, health=${health}`,
          );

          if (health === 'down') {
            console.log(`  Last error: ${lastError}`);
          }

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

    // List all available metrics
    console.log('\n⏳ Listing all available broker metrics...');
    const allMetricsQuery = `{namespace="${TEST_NAMESPACE}"}`;
    const allMetricsResponse = queryPrometheusViaPod(promNs, allMetricsQuery);

    expect(allMetricsResponse.status).toBe('success');
    expect(allMetricsResponse.data).toBeDefined();

    if (!allMetricsResponse.data) {
      throw new Error('Prometheus returned no data');
    }

    const metricNames = new Set<string>();
    const pods = new Set<string>();
    const jobs = new Set<string>();
    allMetricsResponse.data.result.forEach((r) => {
      if (r.metric.__name__) metricNames.add(r.metric.__name__);
      if (r.metric.pod) pods.add(r.metric.pod);
      if (r.metric.job) jobs.add(r.metric.job);
    });
    console.log(
      `✓ Found ${metricNames.size} unique metric types from ${pods.size} pod(s), ${jobs.size} job(s)`,
    );
    console.log(`✓ Pods: ${Array.from(pods).join(', ')}`);
    console.log(`✓ Jobs: ${Array.from(jobs).join(', ')}`);
    console.log(`\n✓ Metric types:`);
    Array.from(metricNames)
      .sort()
      .forEach((name) => console.log(`    - ${name}`));

    // Query for actual broker queue metrics (proves real metrics are being scraped)
    console.log('\n⏳ Querying for broker queue metrics...');
    // Query for the APP.JOBS queue created by BrokerApp
    const queueMetricsQuery = `broker_queue_message_count{namespace="${TEST_NAMESPACE}",queue="APP.JOBS"}`;
    const queueMetricsResponse = queryPrometheusViaPod(promNs, queueMetricsQuery);

    expect(queueMetricsResponse.status).toBe('success');
    expect(queueMetricsResponse.data).toBeDefined();

    if (!queueMetricsResponse.data) {
      throw new Error('Prometheus returned no data');
    }

    expect(queueMetricsResponse.data.result.length).toBeGreaterThan(0);

    const queueMetric = queueMetricsResponse.data.result[0];
    console.log(
      `✓ Queue metrics found: queue=${queueMetric.metric.queue}, address=${queueMetric.metric.address}`,
    );
    console.log(`✓ broker_queue_message_count value: ${queueMetric.value[1]}`);

    // Verify the metric value is valid (should be 0 or more)
    expect(parseFloat(queueMetric.value[1])).toBeGreaterThanOrEqual(0);

    console.log('\n✅ Prometheus is successfully scraping broker queue metrics with mTLS!');
  });
});
