/**
 * Shared PKI Setup Functions
 *
 * This module provides reusable functions for setting up cert-manager PKI infrastructure
 * for ArkMQ BrokerService and BrokerApp resources.
 * Based on the operator tutorial: docs/tutorials/service_app_crd_round_trip.md
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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
 * Wait for a ClusterIssuer to be Ready
 */
async function waitForClusterIssuerReady(issuerName, timeoutMs = 300000) {
  console.log(`⏳ Waiting for ClusterIssuer ${issuerName} to be Ready...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { stdout } = await execAsync(
        `kubectl get clusterissuer ${issuerName} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
      );
      if (stdout.trim() === 'True') {
        console.log(`✓ ClusterIssuer ${issuerName} is Ready`);
        return;
      }
    } catch (error) {
      // Issuer might not exist yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timeout waiting for ClusterIssuer ${issuerName} to be Ready`);
}

/**
 * Wait for a Certificate to be Ready
 */
async function waitForCertificate(namespace, certName, timeoutMs = 300000) {
  console.log(`⏳ Waiting for Certificate ${certName} in namespace ${namespace} to be Ready...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { stdout } = await execAsync(
        `kubectl get certificate ${certName} -n ${namespace} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
      );
      if (stdout.trim() === 'True') {
        console.log(`✓ Certificate ${certName} is Ready`);
        return;
      }
    } catch (error) {
      // Certificate might not exist yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    `Timeout waiting for Certificate ${certName} in namespace ${namespace} to be Ready`,
  );
}

/**
 * Wait for a secret to exist in a namespace
 */
async function waitForSecret(namespace, secretName, timeoutMs = 60000) {
  console.log(`⏳ Waiting for Secret ${secretName} in namespace ${namespace}...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      await execAsync(`kubectl get secret ${secretName} -n ${namespace}`);
      console.log(`✓ Secret ${secretName} exists in namespace ${namespace}`);
      return; // Secret exists
    } catch (error) {
      // Secret doesn't exist yet
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`Timeout waiting for secret ${secretName} in namespace ${namespace}`);
}

/**
 * Wait for a Bundle to be Synced
 */
async function waitForBundle(bundleName, timeoutMs = 300000) {
  console.log(`⏳ Waiting for Bundle ${bundleName} to be Synced...`);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const { stdout } = await execAsync(
        `kubectl get bundle ${bundleName} -n cert-manager -o jsonpath='{.status.conditions[?(@.type=="Synced")].status}'`,
      );
      if (stdout.trim() === 'True') {
        console.log(`✓ Bundle ${bundleName} is Synced`);
        return;
      }
    } catch (error) {
      // Bundle might not exist yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Timeout waiting for Bundle ${bundleName} to be Synced`);
}

/**
 * Creates the cluster-level cert-manager infrastructure
 * This includes:
 * - Self-signed root ClusterIssuer
 * - Root CA Certificate in cert-manager namespace
 * - CA ClusterIssuer (signed by root CA)
 *
 * @returns {Promise<object>} Resource names that were created
 */
async function createClusterInfrastructure() {
  console.log(`📦 Creating cluster PKI infrastructure...`);

  const resourceNames = {
    rootIssuer: 'root-issuer',
    rootCert: 'root-cert',
    rootSecret: 'arkmq-root-cert-secret',
    caIssuer: 'broker-ca-issuer',
  };

  // Step 1: Create self-signed root issuer
  console.log('📦 Step 1: Creating self-signed root ClusterIssuer...');
  const rootIssuerYaml = `
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${resourceNames.rootIssuer}
spec:
  selfSigned: {}
`;
  await applyYaml(rootIssuerYaml);
  await waitForClusterIssuerReady(resourceNames.rootIssuer);

  // Step 2: Create root CA certificate
  console.log('📦 Step 2: Creating root CA certificate...');
  const rootCACertYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${resourceNames.rootCert}
  namespace: cert-manager
spec:
  isCA: true
  commonName: arkmq.root.ca
  secretName: ${resourceNames.rootSecret}
  issuerRef:
    name: ${resourceNames.rootIssuer}
    kind: ClusterIssuer
`;
  await applyYaml(rootCACertYaml);
  await waitForCertificate('cert-manager', resourceNames.rootCert);

  // Step 3: Create CA issuer
  console.log('📦 Step 3: Creating CA-signed ClusterIssuer...');
  const caIssuerYaml = `
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: ${resourceNames.caIssuer}
spec:
  ca:
    secretName: ${resourceNames.rootSecret}
`;
  await applyYaml(caIssuerYaml);
  await waitForClusterIssuerReady(resourceNames.caIssuer);

  console.log('✅ Cluster infrastructure created successfully');
  return resourceNames;
}

/**
 * Creates trust bundle only (operator cert is created per-namespace with resources)
 *
 * @param {string} rootSecretName - Name of the root CA secret (from createClusterInfrastructure)
 * @returns {Promise<object>} Resource names that were created
 */
async function createTrustBundle(rootSecretName) {
  console.log(`📦 Creating trust bundle...`);

  const bundleName = 'activemq-artemis-manager-ca';

  const bundleYaml = `
apiVersion: trust.cert-manager.io/v1alpha1
kind: Bundle
metadata:
  name: ${bundleName}
  namespace: cert-manager
spec:
  sources:
  - secret:
      name: ${rootSecretName}
      key: "tls.crt"
  target:
    secret:
      key: "ca.pem"
`;
  await applyYaml(bundleYaml);
  await waitForBundle(bundleName);

  console.log('✅ Trust bundle created successfully');

  return {
    bundle: bundleName,
  };
}

/**
 * Creates operator certificate in a specific namespace
 *
 * @param {string} namespace - Namespace where the operator cert should be created
 * @param {string} caIssuerName - Name of the CA issuer (from createClusterInfrastructure)
 * @returns {Promise<object>} Resource names that were created
 */
async function createOperatorCert(namespace, caIssuerName) {
  console.log(`📦 Creating operator certificate in namespace: ${namespace}...`);

  const operatorCertName = 'activemq-artemis-manager-cert';

  // Wait for the CA secret to appear in the namespace
  const bundleName = 'activemq-artemis-manager-ca';
  console.log(`⏳ Waiting for CA secret to be distributed to namespace ${namespace}...`);
  await waitForSecret(namespace, bundleName);

  // Create operator certificate
  const operatorCertYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${operatorCertName}
  namespace: ${namespace}
spec:
  secretName: ${operatorCertName}
  commonName: arkmq-org-broker-operator
  issuerRef:
    name: ${caIssuerName}
    kind: ClusterIssuer
`;
  await applyYaml(operatorCertYaml);
  await waitForCertificate(namespace, operatorCertName);

  console.log(`✅ Operator certificate created in namespace ${namespace}`);

  return {
    operatorCert: operatorCertName,
  };
}

/**
 * Creates a certificate for a BrokerService
 *
 * @param {string} serviceName - Name of the BrokerService
 * @param {string} namespace - Namespace where the BrokerService will be deployed
 * @param {string} caIssuerName - Name of the CA issuer to use for signing
 * @returns {Promise<object>} Resource names that were created
 */
async function createServiceCertificate(serviceName, namespace, caIssuerName) {
  console.log(
    `📦 Creating certificate for BrokerService '${serviceName}' in namespace ${namespace}...`,
  );

  // Wait for the CA secret to appear in the namespace (distributed by trust-manager)
  const bundleName = 'activemq-artemis-manager-ca';
  console.log(`⏳ Waiting for CA secret to be distributed to namespace ${namespace}...`);
  await waitForSecret(namespace, bundleName);

  const certName = `${serviceName}-broker-cert`;

  const certYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${certName}
  namespace: ${namespace}
spec:
  secretName: ${certName}
  commonName: ${serviceName}
  dnsNames:
  - ${serviceName}
  - '*.${serviceName}-hdls-svc.${namespace}.svc.cluster.local'
  issuerRef:
    name: ${caIssuerName}
    kind: ClusterIssuer
`;
  await applyYaml(certYaml);
  await waitForCertificate(namespace, certName);

  console.log(`✅ Certificate ${certName} created successfully for BrokerService`);

  return {
    certName: certName,
    secretName: certName,
  };
}

/**
 * Creates a certificate for a BrokerApp
 *
 * @param {string} appName - Name of the BrokerApp
 * @param {string} namespace - Namespace where the BrokerApp will be deployed
 * @param {string} caIssuerName - Name of the CA issuer to use for signing
 * @returns {Promise<object>} Resource names that were created
 */
async function createAppCertificate(appName, namespace, caIssuerName) {
  console.log(`📦 Creating certificate for BrokerApp '${appName}' in namespace ${namespace}...`);

  const certName = `${appName}-app-cert`;

  const certYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${certName}
  namespace: ${namespace}
spec:
  secretName: ${certName}
  commonName: ${appName}
  issuerRef:
    name: ${caIssuerName}
    kind: ClusterIssuer
`;
  await applyYaml(certYaml);
  await waitForCertificate(namespace, certName);

  console.log(`✅ Certificate ${certName} created successfully for BrokerApp`);

  return {
    certName: certName,
    secretName: certName,
  };
}

/**
 * Creates a certificate for Prometheus to scrape broker metrics with mTLS
 *
 * @param {string} namespace - Namespace where the Prometheus certificate should be created
 * @param {string} caIssuerName - Name of the CA issuer to use for signing
 * @returns {Promise<object>} Resource names that were created
 */
async function createPrometheusCertificate(namespace, caIssuerName) {
  console.log(
    `📦 Creating certificate for Prometheus metrics scraping in namespace ${namespace}...`,
  );

  // Wait for the CA secret to appear in the namespace (distributed by trust-manager)
  const bundleName = 'activemq-artemis-manager-ca';
  console.log(`⏳ Waiting for CA secret to be distributed to namespace ${namespace}...`);
  await waitForSecret(namespace, bundleName);

  const certName = 'prometheus-cert';

  const certYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${certName}
  namespace: ${namespace}
spec:
  secretName: ${certName}
  commonName: prometheus
  issuerRef:
    name: ${caIssuerName}
    kind: ClusterIssuer
`;
  await applyYaml(certYaml);
  await waitForCertificate(namespace, certName);

  console.log(`✅ Certificate ${certName} created successfully for Prometheus`);

  return {
    certName: certName,
    secretName: certName,
  };
}

/**
 * Creates the complete PKI infrastructure (cluster infra + trust bundle + operator cert)
 * Note: The operator cert is always created in the 'default' namespace where the operator
 * is hardcoded to look for it (see DefaultOperatorCertSecretName in operator code)
 *
 * @returns {Promise<object>} All created resource names
 */
async function setupCompletePKI() {
  const operatorCertNamespace = 'default';
  const clusterResources = await createClusterInfrastructure();
  const trustResources = await createTrustBundle(clusterResources.rootSecret);
  const operatorResources = await createOperatorCert(
    operatorCertNamespace,
    clusterResources.caIssuer,
  );

  return {
    ...clusterResources,
    ...trustResources,
    ...operatorResources,
    operatorCertNamespace,
  };
}

const OPERATOR_POD_LABEL = 'app.kubernetes.io/name=arkmq-org-broker-operator';

/**
 * Auto-detect the namespace where the ArkMQ operator is running
 * by querying for pods with the operator's well-known label.
 *
 * @param {string} [fallback='default'] - Namespace to return if detection fails
 * @returns {Promise<string>} The detected operator namespace
 */
async function detectOperatorNamespace(fallback = 'default') {
  try {
    const { stdout } = await execAsync(
      `kubectl get pods -A -l ${OPERATOR_POD_LABEL} -o jsonpath='{.items[0].metadata.namespace}'`,
    );
    const ns = stdout.trim().replace(/^'|'$/g, '');
    if (ns) {
      console.log(`✓ Detected operator namespace: ${ns}`);
      return ns;
    }
  } catch (error) {
    // Detection failed, fall through to fallback
  }
  console.log(`⚠️  Could not detect operator namespace, falling back to "${fallback}"`);
  return fallback;
}

module.exports = {
  applyYaml,
  waitForClusterIssuerReady,
  waitForCertificate,
  waitForSecret,
  waitForBundle,
  createClusterInfrastructure,
  createTrustBundle,
  createOperatorCert,
  createServiceCertificate,
  createAppCertificate,
  createPrometheusCertificate,
  setupCompletePKI,
  detectOperatorNamespace,
  execAsync,
};
