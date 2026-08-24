/** Step functions for PKI certificate verification and mTLS job round-trip testing. */
import { expect } from '@playwright/test';
import { kubectl, yarn, sleep, waitForJob, applyYaml, secretExists } from '../fixtures/k8s';

/** Verifies all PKI secrets and the binding secret exist with the correct keys, and the broker is active. */
export function verifyPKISecrets(namespace: string, serviceName: string, appName: string): void {
  const rootIssuer = kubectl(
    `get clusterissuer root-issuer -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
  );
  expect(rootIssuer).toBe('True');

  const caIssuer = kubectl(
    `get clusterissuer broker-ca-issuer -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
  );
  expect(caIssuer).toBe('True');

  // Operator cert lives in the default namespace (hardcoded by the operator).
  expect(secretExists('arkmq-org-broker-manager-cert', 'default')).toBe(true);

  expect(secretExists('arkmq-org-broker-manager-ca', namespace)).toBe(true);
  expect(secretExists(`${serviceName}-broker-cert`, namespace)).toBe(true);
  expect(secretExists(`${appName}-app-cert`, namespace)).toBe(true);
  expect(secretExists(`${appName}-binding-secret`, namespace)).toBe(true);

  const bindingSecret = kubectl(
    `get secret ${appName}-binding-secret -n ${namespace} -o jsonpath='{.data}'`,
  );
  const bindingData = JSON.parse(bindingSecret) as Record<string, string>;
  expect(bindingData).toHaveProperty('uri');
  expect(bindingData).toHaveProperty('host');
  expect(bindingData).toHaveProperty('port');

  // AMQ221007 in broker logs confirms the broker is active and accepting connections.
  const brokerLogs = kubectl(`logs ${serviceName}-ss-0 -n ${namespace}`, { timeout: 30000 });
  expect(brokerLogs).toContain('AMQ221007');

  console.log('✓ All PKI secrets and binding secrets verified');
}

/** Runs a producer and consumer Job over mTLS and verifies the message round-trip completes. */
export async function runMTLSRoundTrip(namespace: string, appName: string): Promise<void> {
  const amqpProducerCommand =
    'exec java -classpath /opt/amq/lib/*:/opt/amq/lib/extra/* org.apache.activemq.artemis.cli.Artemis producer --protocol=AMQP --url amqps://${BROKER_SERVICE_HOST}:${BROKER_SERVICE_PORT}\\?transport.trustStoreType=PEMCA\\&transport.trustStoreLocation=/app/tls/ca/ca.pem\\&transport.keyStoreType=PEMCFG\\&transport.keyStoreLocation=/app/tls/pem/tls.pemcfg --message-count 1 --destination queue://APP.JOBS';
  const amqpConsumerCommand =
    'exec java -classpath /opt/amq/lib/*:/opt/amq/lib/extra/* org.apache.activemq.artemis.cli.Artemis consumer --protocol=AMQP --url amqps://${BROKER_SERVICE_HOST}:${BROKER_SERVICE_PORT}\\?transport.trustStoreType=PEMCA\\&transport.trustStoreLocation=/app/tls/ca/ca.pem\\&transport.keyStoreType=PEMCFG\\&transport.keyStoreLocation=/app/tls/pem/tls.pemcfg --message-count 1 --destination queue://APP.JOBS --receive-timeout 30000';
  const bindingSecretEnv = `
        - name: BROKER_SERVICE_HOST
          valueFrom:
            secretKeyRef:
              name: ${appName}-binding-secret
              key: host
        - name: BROKER_SERVICE_PORT
          valueFrom:
            secretKeyRef:
              name: ${appName}-binding-secret
              key: port`;

  applyYaml(`
apiVersion: v1
kind: Secret
metadata:
  name: cert-pemcfg
  namespace: ${namespace}
type: Opaque
stringData:
  tls.pemcfg: |
    source.key=/app/tls/client/tls.key
    source.cert=/app/tls/client/tls.crt
  java.security: security.provider.6=de.dentrassi.crypto.pem.PemKeyStoreProvider
`);

  kubectl(`delete job ${appName}-producer -n ${namespace} --ignore-not-found=true`);
  applyYaml(`
apiVersion: batch/v1
kind: Job
metadata:
  name: ${appName}-producer
  namespace: ${namespace}
spec:
  backoffLimit: 2
  template:
    spec:
      activeDeadlineSeconds: 900
      restartPolicy: Never
      containers:
      - name: producer
        image: quay.io/arkmq-org/arkmq-org-broker-kubernetes:artemis.2.40.0
        command:
        - "/bin/sh"
        - "-c"
        - ${JSON.stringify(amqpProducerCommand)}
        env:
        - name: JDK_JAVA_OPTIONS
          value: "-Djava.security.properties=/app/tls/pem/java.security"
${bindingSecretEnv}
        volumeMounts:
        - name: trust
          mountPath: /app/tls/ca
        - name: cert
          mountPath: /app/tls/client
        - name: pem
          mountPath: /app/tls/pem
      volumes:
      - name: trust
        secret:
          secretName: arkmq-org-broker-manager-ca
      - name: cert
        secret:
          secretName: ${appName}-app-cert
      - name: pem
        secret:
          secretName: cert-pemcfg
`);

  console.log('\nWaiting for producer job to complete...');
  await waitForJob(`${appName}-producer`, namespace, 900000);
  console.log('✓ Producer sent message successfully');

  kubectl(`delete job ${appName}-consumer -n ${namespace} --ignore-not-found=true`);
  applyYaml(`
apiVersion: batch/v1
kind: Job
metadata:
  name: ${appName}-consumer
  namespace: ${namespace}
spec:
  backoffLimit: 2
  template:
    spec:
      activeDeadlineSeconds: 900
      restartPolicy: Never
      containers:
      - name: consumer
        image: quay.io/arkmq-org/arkmq-org-broker-kubernetes:artemis.2.40.0
        command:
        - "/bin/sh"
        - "-c"
        - ${JSON.stringify(amqpConsumerCommand)}
        env:
        - name: JDK_JAVA_OPTIONS
          value: "-Djava.security.properties=/app/tls/pem/java.security"
${bindingSecretEnv}
        volumeMounts:
        - name: trust
          mountPath: /app/tls/ca
        - name: cert
          mountPath: /app/tls/client
        - name: pem
          mountPath: /app/tls/pem
      volumes:
      - name: trust
        secret:
          secretName: arkmq-org-broker-manager-ca
      - name: cert
        secret:
          secretName: ${appName}-app-cert
      - name: pem
        secret:
          secretName: cert-pemcfg
`);

  console.log('Waiting for consumer job to complete...');
  await waitForJob(`${appName}-consumer`, namespace, 900000);
  // Scope to the Succeeded pod — label selector returns all pods including failed backoff attempts.
  const completedPod = kubectl(
    `get pods -l job-name=${appName}-consumer -n ${namespace} --field-selector=status.phase=Succeeded -o jsonpath='{.items[0].metadata.name}'`,
  );
  const consumerLogs = kubectl(`logs ${completedPod} -n ${namespace}`, { ignoreError: true });
  expect(consumerLogs).toContain('Consumed: 1 messages');
  console.log('✓ Message round-trip complete (producer sent, consumer received)');
}

/** Runs chain-of-trust cleanup and verifies all cluster-level PKI resources are deleted. Must run last. */
export async function verifyPKICleanup(): Promise<void> {
  const cleanupOutput = yarn('chain-of-trust cleanup', { timeout: 180000 });
  expect(cleanupOutput).toContain('Cleanup complete');

  await sleep(10000);

  const rootIssuerExists = kubectl('get clusterissuer root-issuer', { ignoreError: true });
  expect(rootIssuerExists).toBe('');

  const caIssuerExists = kubectl('get clusterissuer broker-ca-issuer', { ignoreError: true });
  expect(caIssuerExists).toBe('');

  const bundleExists = kubectl('get bundle arkmq-org-broker-manager-ca -n cert-manager', {
    ignoreError: true,
  });
  expect(bundleExists).toBe('');

  console.log('✓ PKI resources cleaned up successfully');
}
