/**
 * Prometheus User Workload Monitoring Configuration Script
 *
 * Enables Prometheus user workload monitoring in OpenShift and generates the
 * ScrapeConfig objects that the operator will eventually create on its own.
 * Until arkmq-org/activemq-artemis-operator#1515 lands upstream, this script
 * is the way to wire scraping on a dev cluster.
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const MONITORING_NAMESPACE =
  process.env.MONITORING_NAMESPACE || 'openshift-user-workload-monitoring';
const CLUSTER_MONITORING_NAMESPACE =
  process.env.CLUSTER_MONITORING_NAMESPACE || 'openshift-monitoring';
const MONITORING_CONFIG = process.env.MONITORING_CONFIG || 'cluster-monitoring-config';

const METRICS_PORT = 8888;
const METRICS_PATH = '/metrics';
const WIRING_SUFFIX = '-metrics';
const CLUSTER_DOMAIN = process.env.CLUSTER_DOMAIN || 'cluster.local';

const DEFAULT_CA_SECRET = 'arkmq-org-broker-manager-ca';
const DEFAULT_CA_KEY = 'ca.pem';
const DEFAULT_PROMETHEUS_CERT = 'prometheus-cert';
const APP_CERT_SUFFIX = '-app-cert';

/**
 * Fully qualified pod DNS name matching the operator's OrdinalFQDNS.
 */
function ordinalFQDN(serviceName, namespace, ordinal = 0) {
  return `${serviceName}-ss-${ordinal}.${serviceName}-hdls-svc.${namespace}.svc.${CLUSTER_DOMAIN}`;
}

/**
 * Labels matching the operator's monitoring.Labels.
 */
function monitoringLabels(component, instance, serviceName, appName) {
  const labels = {
    'broker.arkmq.org/monitoring': 'true',
    'app.kubernetes.io/managed-by': 'arkmq-org-broker-operator',
    'app.kubernetes.io/component': component,
    'app.kubernetes.io/instance': instance,
    'broker.arkmq.org/service': serviceName,
  };
  if (appName) {
    labels['broker.arkmq.org/app'] = appName;
  }
  return labels;
}

function formatLabels(labels, indent = 4) {
  const pad = ' '.repeat(indent);
  return Object.entries(labels)
    .map(([k, v]) => `${pad}${k}: "${v}"`)
    .join('\n');
}

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
 * Generate a ScrapeConfig for a BrokerService, matching the operator's
 * monitoring.BuildScrapeConfig with the service identity.
 */
function generateServiceScrapeConfig(options = {}) {
  const {
    serviceName = 'artemis-broker',
    namespace = 'default',
    caSecret = DEFAULT_CA_SECRET,
    caKey = DEFAULT_CA_KEY,
    prometheusCertSecret = DEFAULT_PROMETHEUS_CERT,
  } = options;

  const wiringName = serviceName + WIRING_SUFFIX;
  const fqdn = ordinalFQDN(serviceName, namespace);
  const labels = monitoringLabels('broker-service', serviceName, serviceName);

  return `---
apiVersion: monitoring.coreos.com/v1alpha1
kind: ScrapeConfig
metadata:
  name: ${wiringName}
  namespace: ${namespace}
  labels:
${formatLabels(labels)}
spec:
  staticConfigs:
  - targets:
    - "${fqdn}:${METRICS_PORT}"
    labels:
      job: "${wiringName}"
      brokerservice: "${serviceName}"
      brokerservice_namespace: "${namespace}"
  metricsPath: ${METRICS_PATH}
  scheme: HTTPS
  tlsConfig:
    serverName: "${fqdn}"
    ca:
      secret:
        name: ${caSecret}
        key: ${caKey}
    cert:
      secret:
        name: ${prometheusCertSecret}
        key: tls.crt
    keySecret:
      name: ${prometheusCertSecret}
      key: tls.key
`;
}

/**
 * Generate a ScrapeConfig for a BrokerApp, matching the operator's
 * monitoring.BuildScrapeConfig with the app's own certificate identity.
 */
function generateAppScrapeConfig(options = {}) {
  const {
    appName,
    appNamespace,
    serviceName = 'artemis-broker',
    serviceNamespace = 'default',
    caSecret = DEFAULT_CA_SECRET,
    caKey = DEFAULT_CA_KEY,
  } = options;

  if (!appName) {
    throw new Error('--app-name is required for setup-app-monitoring');
  }

  const wiringName = appName + WIRING_SUFFIX;
  const fqdn = ordinalFQDN(serviceName, serviceNamespace);
  const appCertSecret = appName + APP_CERT_SUFFIX;
  const ns = appNamespace || serviceNamespace;
  const labels = monitoringLabels('broker-app', appName, serviceName, appName);

  return `---
apiVersion: monitoring.coreos.com/v1alpha1
kind: ScrapeConfig
metadata:
  name: ${wiringName}
  namespace: ${ns}
  labels:
${formatLabels(labels)}
spec:
  staticConfigs:
  - targets:
    - "${fqdn}:${METRICS_PORT}"
    labels:
      job: "${wiringName}"
      brokerapp: "${appName}"
      brokerapp_namespace: "${ns}"
      brokerservice: "${serviceName}"
      brokerservice_namespace: "${serviceNamespace}"
  metricsPath: ${METRICS_PATH}
  scheme: HTTPS
  tlsConfig:
    serverName: "${fqdn}"
    ca:
      secret:
        name: ${caSecret}
        key: ${caKey}
    cert:
      secret:
        name: ${appCertSecret}
        key: tls.crt
    keySecret:
      name: ${appCertSecret}
      key: tls.key
`;
}

/**
 * Setup BrokerService scrape config + namespace label
 */
async function setupServiceMonitoring(options = {}) {
  const { serviceName = 'artemis-broker', namespace = 'default' } = options;

  console.log(`📊 Setting up Prometheus scraping for BrokerService ${serviceName}...\n`);

  console.log('📝 Labeling namespace for user monitoring...');
  try {
    await execAsync(
      `kubectl label namespace ${namespace} openshift.io/user-monitoring=true --overwrite`,
    );
    console.log('✓ Namespace labeled');
  } catch (error) {
    console.error('❌ Failed to label namespace:', error.message);
    throw error;
  }

  console.log('\n📝 Creating ScrapeConfig...');
  await applyYaml(generateServiceScrapeConfig(options));
  console.log('✓ ScrapeConfig created');

  console.log(`\n✅ Service monitoring setup complete for ${serviceName}.`);
}

/**
 * Setup BrokerApp scrape config + namespace label
 */
async function setupAppMonitoring(options = {}) {
  const { appName, appNamespace, serviceNamespace = 'default' } = options;
  const ns = appNamespace || serviceNamespace;

  console.log(`📊 Setting up Prometheus scraping for BrokerApp ${appName}...\n`);

  console.log('📝 Labeling namespace for user monitoring...');
  try {
    await execAsync(
      `kubectl label namespace ${ns} openshift.io/user-monitoring=true --overwrite`,
    );
    console.log('✓ Namespace labeled');
  } catch (error) {
    console.error('❌ Failed to label namespace:', error.message);
    throw error;
  }

  console.log('\n📝 Creating ScrapeConfig...');
  await applyYaml(generateAppScrapeConfig(options));
  console.log('✓ ScrapeConfig created');

  console.log(`\n✅ App monitoring setup complete for ${appName}.`);
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
      options.serviceNamespace = args[i + 1];
      i++;
    } else if (args[i] === '--service-namespace' && args[i + 1]) {
      options.serviceNamespace = args[i + 1];
      i++;
    } else if (args[i] === '--app-name' && args[i + 1]) {
      options.appName = args[i + 1];
      i++;
    } else if (args[i] === '--app-namespace' && args[i + 1]) {
      options.appNamespace = args[i + 1];
      i++;
    }
  }

  try {
    if (!command || command === 'help' || command === '--help' || command === '-h') {
      console.log(`
Prometheus User Workload Monitoring Configuration

Usage:
  yarn prometheus-config <command> [options]

Commands:
  enable                  Enable user workload monitoring
  verify                  Verify monitoring setup
  disable                 Disable user workload monitoring (cleanup)
  setup-service-monitoring  Create ScrapeConfig for a BrokerService
  setup-app-monitoring      Create ScrapeConfig for a BrokerApp
  help                    Show this help message

Options for setup-service-monitoring:
  --service-name <name>   BrokerService name (default: artemis-broker)
  --namespace <ns>        Service namespace (default: default)

Options for setup-app-monitoring:
  --app-name <name>             BrokerApp name (required)
  --app-namespace <ns>          App namespace (defaults to --service-namespace)
  --service-name <name>         BrokerService the app is bound to (default: artemis-broker)
  --service-namespace <ns>      Service namespace (default: default)

Environment Variables:
  MONITORING_NAMESPACE              (default: openshift-user-workload-monitoring)
  CLUSTER_MONITORING_NAMESPACE      (default: openshift-monitoring)
  MONITORING_CONFIG                 (default: cluster-monitoring-config)
  CLUSTER_DOMAIN                    (default: cluster.local)

Examples:
  yarn prometheus-config enable

  yarn prometheus-config setup-service-monitoring \\
    --service-name my-service --namespace my-ns

  yarn prometheus-config setup-app-monitoring \\
    --app-name my-app --app-namespace my-ns \\
    --service-name my-service --service-namespace my-ns

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
    } else if (command === 'setup-app-monitoring') {
      await setupAppMonitoring(options);
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
