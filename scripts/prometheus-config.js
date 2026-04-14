/**
 * Prometheus User Workload Monitoring Configuration Script
 *
 * This script enables Prometheus user workload monitoring in OpenShift
 * by applying the necessary ConfigMap and verifying the deployment.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Platform-specific configuration (override via env vars for non-OpenShift platforms)
const MONITORING_NAMESPACE =
  process.env.MONITORING_NAMESPACE || 'openshift-user-workload-monitoring';
const CLUSTER_MONITORING_NAMESPACE =
  process.env.CLUSTER_MONITORING_NAMESPACE || 'openshift-monitoring';
const MONITORING_CONFIG = process.env.MONITORING_CONFIG || 'cluster-monitoring-config';

/**
 * Apply YAML content using kubectl
 */
async function applyYaml(yaml) {
  const escapedYaml = yaml.replace(/'/g, "'\\''");
  const { stdout, stderr } = await execAsync(`echo '${escapedYaml}' | kubectl apply -f -`);
  if (stderr && !stderr.includes('created') && !stderr.includes('configured')) {
    console.error('kubectl stderr:', stderr);
  }
  if (stdout) {
    console.log(stdout.trim());
  }
}

/**
 * Get pods in a namespace
 */
async function getPods(namespace) {
  try {
    const { stdout } = await execAsync(`kubectl -n ${namespace} get pods -o json`);
    return JSON.parse(stdout);
  } catch (error) {
    return null;
  }
}

/**
 * Wait for pods to be ready in a namespace
 */
async function waitForPodsReady(timeoutMs = 300000) {
  console.log(`⏳ Waiting for pods in ${MONITORING_NAMESPACE} to be ready...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const podsData = await getPods(MONITORING_NAMESPACE);

      if (podsData && podsData.items && podsData.items.length > 0) {
        const allReady = podsData.items.every((pod) => {
          const readyCondition = pod.status.conditions?.find((c) => c.type === 'Ready');
          return pod.status.phase === 'Running' && readyCondition?.status === 'True';
        });

        if (allReady) {
          console.log(`✓ All ${podsData.items.length} pod(s) in ${MONITORING_NAMESPACE} are ready`);
          return true;
        }
      }
    } catch (error) {
      // Continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Timeout waiting for pods in ${MONITORING_NAMESPACE} to be ready`);
}

/**
 * Wait for namespace to exist
 */
async function waitForNamespace(timeoutMs = 300000) {
  console.log(`⏳ Waiting for namespace ${MONITORING_NAMESPACE} to be created...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      await execAsync(`kubectl get namespace ${MONITORING_NAMESPACE}`);
      console.log(`✓ Namespace ${MONITORING_NAMESPACE} exists`);
      return true;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  throw new Error(`Timeout waiting for namespace ${MONITORING_NAMESPACE}`);
}

/**
 * Enable user workload monitoring
 */
async function enableMonitoring() {
  console.log('📝 Enabling Prometheus user workload monitoring...\n');

  const configMap = `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${MONITORING_CONFIG}
  namespace: ${CLUSTER_MONITORING_NAMESPACE}
data:
  config.yaml: |
    enableUserWorkload: true
`;

  await applyYaml(configMap);

  console.log('\n✅ ConfigMap applied successfully');
}

/**
 * Verify monitoring setup
 */
async function verifyMonitoring() {
  console.log('\n📊 Verifying monitoring setup...\n');

  // Wait for namespace
  await waitForNamespace();

  // Wait for pods to be ready
  await waitForPodsReady();

  console.log('\n✅ User workload monitoring is enabled and ready!');
}

/**
 * Disable user workload monitoring
 */
async function disableMonitoring() {
  console.log('🧹 Disabling Prometheus user workload monitoring...\n');

  try {
    await execAsync(
      `kubectl delete configmap ${MONITORING_CONFIG} -n ${CLUSTER_MONITORING_NAMESPACE}`,
    );
    console.log('✅ Monitoring disabled (ConfigMap deleted)');
  } catch (error) {
    if (error.message.includes('NotFound')) {
      console.log('ℹ️  ConfigMap already deleted or not found');
    } else {
      throw error;
    }
  }
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2];

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      console.log(`
Prometheus User Workload Monitoring Configuration

Usage:
  yarn prometheus-config <command>

Commands:
  enable    Enable user workload monitoring
  verify    Verify monitoring setup
  disable   Disable user workload monitoring (cleanup)
  help      Show this help message

Environment Variables (for non-OpenShift platforms):
  MONITORING_NAMESPACE              Namespace where user workload monitoring pods run
                                    (default: openshift-user-workload-monitoring)
  CLUSTER_MONITORING_NAMESPACE      Namespace where cluster monitoring config is stored
                                    (default: openshift-monitoring)
  MONITORING_CONFIG                 Name of the ConfigMap that enables monitoring
                                    (default: cluster-monitoring-config)

Examples:
  yarn prometheus-config enable                      # Enable on OpenShift
  MONITORING_NAMESPACE=monitoring yarn prometheus-config enable   # Enable on custom platform
`);
    } else if (command === 'enable') {
      await enableMonitoring();
    } else if (command === 'verify') {
      await verifyMonitoring();
    } else if (command === 'disable') {
      await disableMonitoring();
    } else {
      console.error(`Unknown command: ${command}`);
      console.log('Run "yarn prometheus-config help" for usage information');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
