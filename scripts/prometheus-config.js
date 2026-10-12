/**
 * Prometheus Monitoring Configuration Script
 *
 * Prepares a BrokerService's namespace on OpenShift for the ServiceMonitor the
 * operator generates (arkmq-org/activemq-artemis-operator#1515). That
 * ServiceMonitor labels each queue with the namespace of the app owning it,
 * which only the platform Prometheus honours, so the service's namespace is
 * opted into platform monitoring and the platform Prometheus is allowed to
 * discover targets there. The operator leaves this to the cluster admin; user
 * workload monitoring is not needed for it.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// the platform Prometheus, which scrapes namespaces opted into cluster monitoring
const PLATFORM_PROMETHEUS_NAMESPACE = 'openshift-monitoring';
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
 * Prepare a BrokerService's namespace for the ServiceMonitor the operator
 * generates: opt it into platform monitoring, which then stops user workload
 * monitoring from watching it, and let the platform Prometheus discover the
 * broker there. Mirrors the operator guide's OpenShift requirements.
 */
async function setupServiceMonitoring(options = {}) {
  const { namespace = 'default' } = options;

  console.log(`📊 Preparing ${namespace} for BrokerService metrics...\n`);

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
  namespace: ${PLATFORM_PROMETHEUS_NAMESPACE}
`);
  console.log('✓ Role and RoleBinding applied');

  console.log(
    `\n✅ ${namespace} is ready. The operator generates a <service>-metrics ServiceMonitor ` +
      'for each BrokerService there, provided the prometheus certificate exists when it reconciles it.',
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
    if (args[i] === '--namespace' && args[i + 1]) {
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
  setup-service-monitoring  Prepare a BrokerService namespace for platform monitoring
  help                      Show this help message

Options for setup-service-monitoring:
  --namespace <ns>        Service namespace (default: default)

Examples:
  yarn prometheus-config setup-service-monitoring --namespace my-ns
`);
    } else if (command === 'setup-service-monitoring') {
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
