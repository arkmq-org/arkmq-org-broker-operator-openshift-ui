#!/usr/bin/env node
/**
 * Chain of Trust Management
 *
 * This script manages PKI infrastructure for the ArkMQ
 * BrokerService and BrokerApp CRDs.
 *
 * Usage:
 *   yarn chain-of-trust setup [options]
 *   yarn chain-of-trust create-service-cert --name <service-name> --namespace <namespace>
 *   yarn chain-of-trust create-app-cert --name <app-name> --namespace <namespace>
 *   yarn chain-of-trust create-prometheus-cert --namespace <namespace>
 *   yarn chain-of-trust cleanup [options]
 *
 * Commands:
 *   setup                       Create PKI infrastructure (root CA, issuers, trust bundle, operator cert)
 *   create-service-cert         Create certificate for a BrokerService
 *   create-app-cert             Create certificate for a BrokerApp
 *   create-prometheus-cert      Create certificate for Prometheus metrics scraping with mTLS
 *   cleanup                     Remove PKI infrastructure
 *
 * Options:
 *   --namespace <name>          Target namespace (auto-detected from cluster if omitted for setup)
 *   --name <name>               Resource name (required for create-service-cert and create-app-cert)
 *   --help                      Show this help message
 */

const {
  setupCompletePKI,
  createServiceCertificate,
  createAppCertificate,
  createPrometheusCertificate,
} = require('./setup-pki');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
let namespace = null;
let name = null;

function showHelp() {
  console.log(`
Chain of Trust Management

This script manages PKI infrastructure for the ArkMQ
BrokerService and BrokerApp CRDs.

Usage:
  yarn chain-of-trust setup
  yarn chain-of-trust create-service-cert --name <service-name> --namespace <namespace>
  yarn chain-of-trust create-app-cert --name <app-name> --namespace <namespace>
  yarn chain-of-trust create-prometheus-cert --namespace <namespace>
  yarn chain-of-trust cleanup

Commands:
  setup                       Create PKI infrastructure (root CA, issuers, trust bundle, operator cert)
  create-service-cert         Create certificate for a BrokerService
  create-app-cert             Create certificate for a BrokerApp
  create-prometheus-cert      Create certificate for Prometheus metrics scraping with mTLS
  cleanup                     Remove PKI infrastructure

Options:
  --namespace <name>          Target namespace (required for create-service-cert, create-app-cert, create-prometheus-cert)
  --name <name>               Resource name (required for create-service-cert and create-app-cert)
  --help                      Show this help message

Examples:
  # Setup the PKI infrastructure (creates operator cert in 'default' namespace)
  yarn chain-of-trust setup

  # Create certificate for a BrokerService
  yarn chain-of-trust create-service-cert --name messaging-service --namespace service-namespace

  # Create a certificate for a BrokerApp
  yarn chain-of-trust create-app-cert --name first-app --namespace app-namespace

  # Create certificate for Prometheus to scrape broker metrics with mTLS
  yarn chain-of-trust create-prometheus-cert --namespace my-namespace

  # Cleanup all PKI resources
  yarn chain-of-trust cleanup

Note: The operator certificate is always created in the 'default' namespace where
      the operator expects to find it (hardcoded DefaultOperatorCertSecretName).
`);
  process.exit(0);
}

// Parse options
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--namespace' && args[i + 1]) {
    namespace = args[i + 1];
    i++;
  } else if (args[i] === '--name' && args[i + 1]) {
    name = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    showHelp();
  }
}

const validCommands = [
  'setup',
  'create-service-cert',
  'create-app-cert',
  'create-prometheus-cert',
  'cleanup',
];
if (!command || !validCommands.includes(command)) {
  console.error(`Error: Please specify a valid command (${validCommands.join(', ')})`);
  showHelp();
}

const resourceNames = {
  rootIssuer: 'root-issuer',
  rootCert: 'root-cert',
  rootSecret: 'arkmq-root-cert-secret',
  caIssuer: 'broker-ca-issuer',
  bundle: 'activemq-artemis-manager-ca',
  operatorCert: 'activemq-artemis-manager-cert',
};

/**
 * Helper: Delete certificates matching a pattern across all namespaces
 */
async function deleteCertificatePattern(pattern) {
  try {
    await execAsync(
      `kubectl get certificates -A -o json 2>/dev/null | jq -r '.items[] | select(.metadata.name | contains("${pattern}")) | "\\(.metadata.namespace) \\(.metadata.name)"' | xargs -r -L1 sh -c 'kubectl delete certificate $1 -n $0 --ignore-not-found=true' || true`,
    );
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Helper: Delete secrets matching a pattern across all namespaces
 */
async function deleteSecretPattern(pattern) {
  try {
    await execAsync(
      `kubectl get secrets -A -o json 2>/dev/null | jq -r '.items[] | select(.metadata.name | contains("${pattern}")) | "\\(.metadata.namespace) \\(.metadata.name)"' | xargs -r -L1 sh -c 'kubectl delete secret $1 -n $0 --ignore-not-found=true' || true`,
    );
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Setup function - creates PKI infrastructure
 */
async function setup() {
  console.log('\n🔐 Setting up Chain of Trust for ArkMQ\n');

  try {
    const createdResources = await setupCompletePKI();

    // Success summary
    console.log('\n✅ Chain of Trust Setup Complete!\n');
    console.log('Created resources:');
    console.log(`  ✓ ClusterIssuer: ${createdResources.rootIssuer} (self-signed)`);
    console.log(`  ✓ Certificate: ${createdResources.rootCert} (in cert-manager namespace)`);
    console.log(`  ✓ ClusterIssuer: ${createdResources.caIssuer} (CA-signed)`);
    console.log(`  ✓ Bundle: ${createdResources.bundle} (distributes to all namespaces)`);
    console.log(
      `  ✓ Certificate: ${createdResources.operatorCert} (in ${createdResources.operatorCertNamespace} namespace)`,
    );
    console.log('\nYou can now:');
    console.log(`  1. Create BrokerService and BrokerApp certificates using:`);
    console.log(
      `     yarn chain-of-trust create-service-cert --name <service-name> --namespace <namespace>`,
    );
    console.log(
      `     yarn chain-of-trust create-app-cert --name <app-name> --namespace <namespace>`,
    );
    console.log(
      `  2. The trust bundle "${createdResources.bundle}" will automatically appear in all namespaces\n`,
    );
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
    console.error('\nMake sure you have:');
    console.error('  - kubectl configured and connected to your cluster');
    console.error('  - cert-manager installed in your cluster');
    console.error('  - trust-manager installed in your cluster');
    console.error('  - Appropriate permissions to create cluster-wide resources\n');
    process.exit(1);
  }
}

/**
 * Create Service Certificate function
 */
async function createServiceCert() {
  if (!name) {
    console.error('\n❌ Error: --name is required for create-service-cert');
    showHelp();
  }
  if (!namespace) {
    console.error('\n❌ Error: --namespace is required for create-service-cert');
    showHelp();
  }

  console.log(`\n📜 Creating certificates for BrokerService '${name}' in namespace ${namespace}\n`);

  try {
    const result = await createServiceCertificate(name, namespace, resourceNames.caIssuer);

    console.log('\n✅ BrokerService Certificate Created!\n');
    console.log(`Created resources:`);
    console.log(`  ✓ Certificate: ${result.certName} (service)`);
    console.log(`  ✓ Secret: ${result.secretName} (service)`);
    console.log(`\nYou can now deploy your BrokerService '${name}' in namespace ${namespace}\n`);
  } catch (error) {
    console.error('\n❌ Error creating service certificate:', error.message);
    console.error('\nMake sure:');
    console.error('  - PKI infrastructure is set up (run "yarn chain-of-trust setup" first)');
    console.error('  - The namespace exists');
    console.error('  - kubectl is configured correctly\n');
    process.exit(1);
  }
}

/**
 * Create App Certificate function
 */
async function createAppCert() {
  if (!name) {
    console.error('\n❌ Error: --name is required for create-app-cert');
    showHelp();
  }
  if (!namespace) {
    console.error('\n❌ Error: --namespace is required for create-app-cert');
    showHelp();
  }

  console.log(`\n📜 Creating certificate for BrokerApp '${name}' in namespace ${namespace}\n`);

  try {
    const result = await createAppCertificate(name, namespace, resourceNames.caIssuer);

    console.log('\n✅ BrokerApp Certificate Created!\n');
    console.log(`Created resources:`);
    console.log(`  ✓ Certificate: ${result.certName}`);
    console.log(`  ✓ Secret: ${result.secretName}`);
    console.log(`\nYou can now deploy your BrokerApp '${name}' in namespace ${namespace}\n`);
  } catch (error) {
    console.error('\n❌ Error creating app certificate:', error.message);
    console.error('\nMake sure:');
    console.error('  - PKI infrastructure is set up (run "yarn chain-of-trust setup" first)');
    console.error('  - The namespace exists');
    console.error('  - kubectl is configured correctly\n');
    process.exit(1);
  }
}

/**
 * Create Prometheus Certificate function
 */
async function createPrometheusCert() {
  if (!namespace) {
    console.error('\n❌ Error: --namespace is required for create-prometheus-cert');
    showHelp();
  }

  console.log(
    `\n📜 Creating certificate for Prometheus metrics scraping in namespace ${namespace}\n`,
  );

  try {
    const result = await createPrometheusCertificate(namespace, resourceNames.caIssuer);

    console.log('\n✅ Prometheus Certificate Created!\n');
    console.log(`Created resources:`);
    console.log(`  ✓ Certificate: ${result.certName}`);
    console.log(`  ✓ Secret: ${result.secretName}`);
    console.log(
      `\nYou can now configure Prometheus to scrape broker metrics with mTLS in namespace ${namespace}`,
    );
    console.log(
      `Use "yarn prometheus-config create-servicemonitor" to generate ServiceMonitor YAML\n`,
    );
  } catch (error) {
    console.error('\n❌ Error creating Prometheus certificate:', error.message);
    console.error('\nMake sure:');
    console.error('  - PKI infrastructure is set up (run "yarn chain-of-trust setup" first)');
    console.error('  - The namespace exists');
    console.error('  - kubectl is configured correctly\n');
    process.exit(1);
  }
}

/**
 * Cleanup function - removes PKI infrastructure
 */
async function cleanup() {
  const operatorCertNamespace = 'default';

  console.log('\n🧹 Cleaning up Chain of Trust Resources\n');

  try {
    // Delete Bundle
    console.log('  Deleting Bundle...');
    await execAsync(
      `kubectl delete bundle ${resourceNames.bundle} -n cert-manager --ignore-not-found=true`,
    );

    // Delete operator certificate from default namespace
    console.log(`  Deleting operator certificate from ${operatorCertNamespace}...`);
    await execAsync(
      `kubectl delete certificate ${resourceNames.operatorCert} -n ${operatorCertNamespace} --ignore-not-found=true`,
    );
    await execAsync(
      `kubectl delete secret ${resourceNames.operatorCert} -n ${operatorCertNamespace} --ignore-not-found=true`,
    );

    // Delete all broker certificates (service and app) from all namespaces
    console.log('  Deleting all BrokerService certificates...');
    await deleteCertificatePattern('broker-cert');
    await deleteSecretPattern('broker-cert');

    console.log('  Deleting all BrokerApp certificates...');
    await deleteCertificatePattern('app-cert');
    await deleteSecretPattern('app-cert');

    // Delete all Prometheus certificates
    console.log('  Deleting all Prometheus certificates...');
    await deleteCertificatePattern('prometheus-cert');
    await deleteSecretPattern('prometheus-cert');

    // Delete ClusterIssuers
    console.log('  Deleting ClusterIssuers...');
    await execAsync(
      `kubectl delete clusterissuer ${resourceNames.rootIssuer} ${resourceNames.caIssuer} --ignore-not-found=true`,
    );

    // Delete root CA certificate and secret
    console.log('  Deleting root CA resources...');
    await execAsync(
      `kubectl delete certificate ${resourceNames.rootCert} -n cert-manager --ignore-not-found=true`,
    );
    await execAsync(
      `kubectl delete secret ${resourceNames.rootSecret} -n cert-manager --ignore-not-found=true`,
    );

    console.log('\n✅ Cleanup complete!\n');
    console.log('Removed resources:');
    console.log(`  ✓ Bundle: ${resourceNames.bundle}`);
    console.log(
      `  ✓ Operator certificate (${resourceNames.operatorCert} from ${operatorCertNamespace})`,
    );
    console.log(`  ✓ All BrokerService certificates and secrets (pattern: *broker-cert*)`);
    console.log(`  ✓ All BrokerApp certificates and secrets (pattern: *app-cert*)`);
    console.log(`  ✓ All Prometheus certificates and secrets (pattern: *prometheus-cert*)`);
    console.log(`  ✓ ClusterIssuers: ${resourceNames.rootIssuer}, ${resourceNames.caIssuer}`);
    console.log(`  ✓ Certificate: ${resourceNames.rootCert} (from cert-manager)`);
    console.log(`  ✓ Secret: ${resourceNames.rootSecret} (from cert-manager)\n`);
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    console.error('\nSome resources may not have been deleted. Check manually with kubectl.\n');
    process.exit(1);
  }
}

// Run the appropriate command
if (command === 'setup') {
  setup();
} else if (command === 'create-service-cert') {
  createServiceCert();
} else if (command === 'create-app-cert') {
  createAppCert();
} else if (command === 'create-prometheus-cert') {
  createPrometheusCert();
} else if (command === 'cleanup') {
  cleanup();
}
