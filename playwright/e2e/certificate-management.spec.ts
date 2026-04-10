import { test, expect } from '@playwright/test';
import {
  kubectl,
  yarn,
  waitForCondition,
  waitForPod,
  createNamespace,
  deleteNamespace,
  applyYaml,
  secretExists,
} from '../fixtures/k8s';

const TEST_NAMESPACE = 'cert-mgmt-e2e-test';
const SERVICE_NAME = 'test-messaging-service';
const APP_NAME = 'test-app';

test.describe('Certificate Management E2E', () => {
  test.beforeAll(() => {
    console.log('\n🧪 Starting Certificate Management E2E Tests\n');
  });

  test.afterAll(async () => {
    // Cleanup test namespace
    console.log('\n🧹 Cleaning up test namespace...');
    deleteNamespace(TEST_NAMESPACE);

    console.log('\n✅ E2E Tests Complete\n');
  });

  test('complete workflow: setup, deploy, and cleanup', async () => {
    // Step 1: Setup PKI infrastructure
    console.log('\n📦 Step 1: Setting up PKI infrastructure...');
    const setupOutput = yarn('chain-of-trust setup', { timeout: 180000 });
    expect(setupOutput).toContain('Chain of Trust Setup Complete');
    expect(setupOutput).toContain('ClusterIssuer: root-issuer');
    expect(setupOutput).toContain('ClusterIssuer: broker-ca-issuer');
    expect(setupOutput).toContain('Bundle: activemq-artemis-manager-ca');
    expect(setupOutput).toContain('Certificate: activemq-artemis-manager-cert');
    expect(setupOutput).toContain('in default namespace');

    // Verify ClusterIssuers are ready
    const rootIssuer = kubectl(
      `get clusterissuer root-issuer -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
    );
    expect(rootIssuer).toBe('True');

    const caIssuer = kubectl(
      `get clusterissuer broker-ca-issuer -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
    );
    expect(caIssuer).toBe('True');

    // Verify operator certificate was created in default namespace
    const operatorNamespace = 'default';
    console.log(`  ✓ Operator certificate created in default namespace`);
    expect(secretExists('activemq-artemis-manager-cert', operatorNamespace)).toBe(true);

    // Step 2: Create test namespace
    console.log('\n📦 Step 2: Creating test namespace...');
    createNamespace(TEST_NAMESPACE);

    // Step 3: Create BrokerService certificates
    console.log('\n📦 Step 3: Creating BrokerService certificate...');
    const serviceCertOutput = yarn(
      `chain-of-trust create-service-cert --name ${SERVICE_NAME} --namespace ${TEST_NAMESPACE}`,
      { timeout: 180000 },
    );
    expect(serviceCertOutput).toContain('BrokerService Certificate Created');
    expect(serviceCertOutput).toContain(`${SERVICE_NAME}-broker-cert`);

    // Verify certificates exist
    expect(secretExists('activemq-artemis-manager-ca', TEST_NAMESPACE)).toBe(true);
    expect(secretExists(`${SERVICE_NAME}-broker-cert`, TEST_NAMESPACE)).toBe(true);

    // Step 4: Deploy BrokerService
    console.log('\n📦 Step 4: Deploying BrokerService...');
    const brokerServiceYaml = `
apiVersion: arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: ${SERVICE_NAME}
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

    // Check BrokerService status before waiting for pod
    console.log('\n⏳ Checking BrokerService status...');
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait for operator to process
    const brokerStatus = kubectl(
      `get brokerservice ${SERVICE_NAME} -n ${TEST_NAMESPACE} -o jsonpath='{.status.conditions[?(@.type=="Valid")].message}'`,
    );
    if (brokerStatus && brokerStatus.includes('failed')) {
      throw new Error(`BrokerService validation failed: ${brokerStatus}`);
    }

    // Wait for broker pod to be running (longer timeout for CI image pulls)
    console.log('\n⏳ Waiting for broker pod to be ready...');
    await waitForPod(`${SERVICE_NAME}-ss-0`, TEST_NAMESPACE, 600000);

    // Wait for BrokerService to be deployed
    console.log('\n⏳ Waiting for BrokerService to be deployed...');
    await waitForCondition(
      'brokerservice',
      SERVICE_NAME,
      TEST_NAMESPACE,
      'Deployed',
      'True',
      600000,
    );

    // Step 5: Create BrokerApp certificates
    console.log('\n📦 Step 5: Creating BrokerApp certificate...');
    const appCertOutput = yarn(
      `chain-of-trust create-app-cert --name ${APP_NAME} --namespace ${TEST_NAMESPACE}`,
      { timeout: 180000 },
    );
    expect(appCertOutput).toContain('BrokerApp Certificate Created');
    expect(appCertOutput).toContain(`${APP_NAME}-app-cert`);

    // Verify app certificate exists
    expect(secretExists(`${APP_NAME}-app-cert`, TEST_NAMESPACE)).toBe(true);

    // Step 6: Deploy BrokerApp
    console.log('\n📦 Step 6: Deploying BrokerApp...');
    const brokerAppYaml = `
apiVersion: arkmq.org/v1beta2
kind: BrokerApp
metadata:
  name: ${APP_NAME}
  namespace: ${TEST_NAMESPACE}
spec:
  selector:
    matchLabels:
      forWorkQueue: "true"
  acceptor:
    port: 61616
  capabilities:
  - producerOf:
    - address: "APP.JOBS"
  - consumerOf:
    - address: "APP.JOBS"
`;
    applyYaml(brokerAppYaml);

    // Wait for BrokerApp to be valid
    console.log('\n⏳ Waiting for BrokerApp to be valid...');
    await waitForCondition('brokerapp', APP_NAME, TEST_NAMESPACE, 'Valid', 'True', 120000);

    // Verify binding secret was created
    console.log('\n✓ Verifying app binding secret...');
    expect(secretExists(`${APP_NAME}-binding-secret`, TEST_NAMESPACE)).toBe(true);

    // Step 7: Verify broker is functional
    console.log('\n📦 Step 7: Verifying broker is active...');
    const brokerLogs = kubectl(`logs ${SERVICE_NAME}-ss-0 -n ${TEST_NAMESPACE}`, {
      timeout: 30000,
    });

    // Check for broker started message
    expect(brokerLogs).toContain('AMQ221007');
    console.log('  ✓ Broker is active (AMQ221007 found in logs)');

    // Step 8: Verify all expected secrets exist
    console.log('\n📦 Step 8: Verifying all certificates and secrets...');
    const secrets = kubectl(`get secrets -n ${TEST_NAMESPACE} -o json`);
    const secretsJson = JSON.parse(secrets) as {
      items: Array<{ metadata: { name: string } }>;
    };
    const secretNames = secretsJson.items.map((s) => s.metadata.name);

    expect(secretNames).toContain('activemq-artemis-manager-ca');
    // Operator cert is in default namespace (hardcoded in operator)
    expect(secretExists('activemq-artemis-manager-cert', 'default')).toBe(true);
    expect(secretNames).toContain(`${SERVICE_NAME}-broker-cert`);
    expect(secretNames).toContain(`${APP_NAME}-app-cert`);
    expect(secretNames).toContain(`${APP_NAME}-binding-secret`);

    // Verify binding secret has correct keys
    const bindingSecret = kubectl(
      `get secret ${APP_NAME}-binding-secret -n ${TEST_NAMESPACE} -o jsonpath='{.data}'`,
    );
    const bindingData = JSON.parse(bindingSecret);
    expect(bindingData).toHaveProperty('uri');
    expect(bindingData).toHaveProperty('host');
    expect(bindingData).toHaveProperty('port');

    console.log('\n✅ All verifications passed!');
    console.log('\n📊 Summary:');
    console.log('  ✓ PKI infrastructure setup');
    console.log('  ✓ Operator certificate created in default namespace');
    console.log('  ✓ BrokerService certificate created');
    console.log('  ✓ BrokerApp certificate created');
    console.log('  ✓ BrokerService deployed (Deployed=True)');
    console.log('  ✓ BrokerApp deployed (Valid=True)');
    console.log('  ✓ Broker pod is active (AMQ221007)');
    console.log('  ✓ All required secrets exist');
    console.log('  ✓ Binding secret contains connection details');
  });

  test('cleanup removes all PKI resources', async () => {
    console.log('\n🧹 Testing cleanup functionality...');

    // Run cleanup
    const cleanupOutput = yarn('chain-of-trust cleanup', { timeout: 180000 });
    expect(cleanupOutput).toContain('Cleanup complete');

    // Wait a bit for resources to be deleted
    await new Promise((resolve) => setTimeout(resolve, 10000));

    // Verify ClusterIssuers are deleted
    const rootIssuerExists = kubectl('get clusterissuer root-issuer', { ignoreError: true });
    expect(rootIssuerExists).toBe('');

    const caIssuerExists = kubectl('get clusterissuer broker-ca-issuer', { ignoreError: true });
    expect(caIssuerExists).toBe('');

    // Verify Bundle is deleted
    const bundleExists = kubectl('get bundle activemq-artemis-manager-ca -n cert-manager', {
      ignoreError: true,
    });
    expect(bundleExists).toBe('');

    console.log('\n✅ Cleanup verified successfully');
  });
});
