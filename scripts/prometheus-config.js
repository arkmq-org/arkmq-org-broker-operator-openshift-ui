/**
 * Prometheus Monitoring Configuration Script
 *
 * Enables Prometheus user workload monitoring in OpenShift, and prepares a
 * BrokerService's namespace for the ServiceMonitor the operator generates
 * (arkmq-org/activemq-artemis-operator#1515). That ServiceMonitor labels each
 * queue with the namespace of the app owning it, which only the platform
 * Prometheus honours, so the service's namespace is opted into platform
 * monitoring and the platform Prometheus is allowed to discover targets there.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const MONITORING_NAMESPACE =
  process.env.MONITORING_NAMESPACE || 'openshift-user-workload-monitoring';
const CLUSTER_MONITORING_NAMESPACE =
  process.env.CLUSTER_MONITORING_NAMESPACE || 'openshift-monitoring';
const MONITORING_CONFIG = process.env.MONITORING_CONFIG || 'cluster-monitoring-config';

// the platform Prometheus, which scrapes namespaces opted into cluster monitoring
const PLATFORM_PROMETHEUS_SA = 'prometheus-k8s';

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
  let podsCreated = false;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const podsData = await getPods(MONITORING_NAMESPACE);

      if (podsData && podsData.items && podsData.items.length > 0) {
        const relevantPods = podsData.items.filter(
          (pod) =>
            !pod.metadata.name.startsWith('prom-targets-') &&
            !pod.metadata.name.startsWith('prom-query-'),
        );

        if (relevantPods.length > 0) {
          if (!podsCreated) {
            console.log(`  Found ${relevantPods.length} monitoring pod(s), waiting for ready...`);
            podsCreated = true;
          }

          const allReady = relevantPods.every((pod) => {
            const readyCondition = pod.status.conditions?.find((c) => c.type === 'Ready');
            return pod.status.phase === 'Running' && readyCondition?.status === 'True';
          });

          if (allReady) {
            console.log(`✓ All ${relevantPods.length} pod(s) in ${MONITORING_NAMESPACE} are ready`);
            return true;
          }
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

  await waitForNamespace();
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
 * Prepare a BrokerService's namespace for the ServiceMonitor the operator
 * generates: opt it into platform monitoring, which then stops user workload
 * monitoring from watching it, and let the platform Prometheus discover the
 * broker there. Mirrors the operator guide's OpenShift requirements.
 */
async function setupServiceMonitoring(options = {}) {
  const { serviceName = 'artemis-broker', namespace = 'default' } = options;

  console.log(`📊 Preparing ${namespace} for BrokerService ${serviceName}'s metrics...\n`);

  console.log('📝 Opting the namespace into platform monitoring...');
  await execAsync(
    `kubectl label namespace ${namespace} openshift.io/cluster-monitoring=true --overwrite`,
  );
  console.log('✓ Namespace labeled');

  console.log('\n📝 Allowing the platform Prometheus to discover targets...');
  await applyYaml(`apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${PLATFORM_PROMETHEUS_SA}
  namespace: ${namespace}
rules:
- apiGroups: [""]
  resources: [services, endpoints, pods]
  verbs: [get, list, watch]
- apiGroups: [discovery.k8s.io]
  resources: [endpointslices]
  verbs: [get, list, watch]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${PLATFORM_PROMETHEUS_SA}
  namespace: ${namespace}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${PLATFORM_PROMETHEUS_SA}
subjects:
- kind: ServiceAccount
  name: ${PLATFORM_PROMETHEUS_SA}
  namespace: ${CLUSTER_MONITORING_NAMESPACE}
`);
  console.log('✓ Role and RoleBinding applied');

  console.log(
    `\n✅ ${namespace} is ready. The operator generates ServiceMonitor ${serviceName}-metrics ` +
      'once the prometheus certificate exists when it reconciles the service.',
  );
}

/**
 * Main function
 */
async function main() {
  const command = process.argv[2];

  const args = process.argv.slice(3);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--service-name' && args[i + 1]) {
      options.serviceName = args[i + 1];
      i++;
    } else if (args[i] === '--namespace' && args[i + 1]) {
      options.namespace = args[i + 1];
      i++;
    }
  }

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      console.log(`
Prometheus Monitoring Configuration

Usage:
  yarn prometheus-config <command> [options]

Commands:
  enable                  Enable user workload monitoring
  verify                  Verify monitoring setup
  disable                 Disable user workload monitoring (cleanup)
  setup-service-monitoring  Prepare a BrokerService namespace for platform monitoring
  help                    Show this help message

Options for setup-service-monitoring:
  --service-name <name>   BrokerService name (default: artemis-broker)
  --namespace <ns>        Service namespace (default: default)

Environment Variables:
  MONITORING_NAMESPACE              (default: openshift-user-workload-monitoring)
  CLUSTER_MONITORING_NAMESPACE      (default: openshift-monitoring)
  MONITORING_CONFIG                 (default: cluster-monitoring-config)

Examples:
  yarn prometheus-config enable

  yarn prometheus-config setup-service-monitoring \\
    --service-name my-service --namespace my-ns

  yarn prometheus-config verify
`);
    } else if (command === 'enable') {
      await enableMonitoring();
    } else if (command === 'verify') {
      await verifyMonitoring();
    } else if (command === 'disable') {
      await disableMonitoring();
    } else if (command === 'setup-service-monitoring') {
      await setupServiceMonitoring(options);
    } else if (command === 'setup-monitoring') {
      console.log('⚠️  setup-monitoring is deprecated, use setup-service-monitoring instead.');
      await setupServiceMonitoring(options);
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
