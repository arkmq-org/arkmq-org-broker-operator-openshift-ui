/**
 * Consolidated E2E suite. Deploys shared broker infrastructure once in beforeAll
 * and runs all feature verifications sequentially. Each test() block covers one
 * user-facing feature. Step logic lives in playwright/steps/ by domain.
 */
import { test, expect } from '@playwright/test';
import { kubectl, yarn, createNamespace, deleteNamespace } from '../fixtures/k8s';
import { login } from '../fixtures/auth';
import {
  createServiceCert,
  createBrokerServiceViaForm,
  patchBrokerServiceLabels,
  verifyBrokerServiceList,
  createBrokerServiceViaYaml,
  verifyBrokerServiceOverviewTab,
  verifyBrokerServiceTabSwitching,
} from '../steps/brokerservice.steps';
import {
  createAppCert,
  createBrokerAppViaForm,
  createBrokerAppWithProducerAddresses,
  createPendingBrokerApp,
  verifyBrokerAppListVisibility,
  verifyBrokerAppSearch,
  verifyServiceLinkNavigation,
  verifyDeleteFromList,
} from '../steps/brokerapp.steps';
import { verifyPKISecrets, runMTLSRoundTrip, verifyPKICleanup } from '../steps/certificate.steps';

const TEST_NAMESPACE = 'e2e-suite';
const SERVICE_NAME = 'e2e-broker-service';
const MAIN_APP = 'e2e-app-matching';
const PENDING_APP = 'e2e-app-nomatch';

const username = 'kubeadmin';
const password = process.env.KUBEADMIN_PASSWORD || 'kubeadmin';

const BROKERAPP_LIST_URL = `/k8s/ns/${TEST_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerApp`;

test.describe.serial('E2E Suite', () => {
  test.beforeAll(async () => {
    test.setTimeout(1_800_000); // PKI setup only — chain-of-trust setup takes up to 20 min on cold CRC
    console.log('\nSetting up PKI infrastructure...');
    yarn('chain-of-trust setup', { timeout: 1_200_000 });
    createNamespace(TEST_NAMESPACE);
  });

  test.afterAll(() => {
    kubectl(`delete brokerapps --all -n ${TEST_NAMESPACE} --ignore-not-found=true`, {
      ignoreError: true,
    });
    deleteNamespace(TEST_NAMESPACE);
    console.log('\nSuite cleanup complete\n');
  });

  // ── 1. Smoke ──────────────────────────────────────────────────────────────

  test('console loads and login succeeds', async ({ page }) => {
    await login(page, username, password);
    await expect(page).toHaveURL(/localhost/, { timeout: 30000 });
  });

  // ── 2. BrokerService — create via UI form ─────────────────────────────────
  // Creates the shared BrokerService all subsequent tests run against.

  test('create BrokerService via UI form and verify it deploys', async ({ page }) => {
    test.setTimeout(3_600_000);
    createServiceCert(SERVICE_NAME, TEST_NAMESPACE);
    await login(page, username, password);
    await createBrokerServiceViaForm(page, SERVICE_NAME, TEST_NAMESPACE);
    // Patch labels needed downstream: tier=e2e for BrokerApp typeahead, app=messaging for details page.
    patchBrokerServiceLabels(SERVICE_NAME, TEST_NAMESPACE, { tier: 'e2e', app: 'messaging' });
  });

  // ── 3. BrokerService — list page ──────────────────────────────────────────

  test('BrokerService list page shows deployed service and navigates to detail', async ({
    page,
  }) => {
    await login(page, username, password);
    await verifyBrokerServiceList(page, TEST_NAMESPACE, SERVICE_NAME);
  });

  // ── 4. BrokerService — YAML editor ───────────────────────────────────────

  test('create BrokerService via YAML editor and verify resource spec', async ({ page }) => {
    await login(page, username, password);
    await createBrokerServiceViaYaml(page, TEST_NAMESPACE);
  });

  // ── 5. BrokerService — details page Overview tab ──────────────────────────

  test('BrokerService details page shows Overview tab with cluster labels', async ({ page }) => {
    await login(page, username, password);
    await verifyBrokerServiceOverviewTab(page, TEST_NAMESPACE, SERVICE_NAME, [
      'tier=e2e',
      'app=messaging',
    ]);
  });

  // ── 6. BrokerService — details page tab switching ────────────────────────

  test('BrokerService details page switches between Overview and YAML tabs', async ({ page }) => {
    await login(page, username, password);
    await verifyBrokerServiceTabSwitching(page, TEST_NAMESPACE, SERVICE_NAME);
  });

  // ── 7. BrokerApp — create via UI form, matching labels ───────────────────
  // Creates MAIN_APP. Tests 10–15 depend on this app being Deployed.

  test('create BrokerApp via UI form with matching labels and verify binding', async ({ page }) => {
    test.setTimeout(3_600_000);
    createAppCert(MAIN_APP, TEST_NAMESPACE);
    await login(page, username, password);
    await createBrokerAppViaForm(page, TEST_NAMESPACE, MAIN_APP, 'tier', 'e2e', SERVICE_NAME);
  });

  // ── 8. BrokerApp — multiple producerOf addresses ─────────────────────────

  test('multiple producerOf addresses appear in spec', async ({ page }) => {
    await login(page, username, password);
    await createBrokerAppWithProducerAddresses(page, TEST_NAMESPACE, 'e2e-app-multi-produces', [
      'QUEUE.ORDERS',
      'QUEUE.INVOICES',
      'QUEUE.NOTIFICATIONS',
    ]);
  });

  // ── 9. BrokerApp — non-matching labels stays Pending ─────────────────────
  // Creates PENDING_APP. Tests 10–13 depend on this app being Pending.

  test('non-matching labels - BrokerApp stays pending', async () => {
    await createPendingBrokerApp(TEST_NAMESPACE, PENDING_APP);
  });

  // ── 10–13. BrokerApp — list page ─────────────────────────────────────────

  test.describe('BrokerApp list page', () => {
    test('provisioned and pending apps both appear in list', async ({ page }) => {
      await login(page, username, password);
      await verifyBrokerAppListVisibility(
        page,
        TEST_NAMESPACE,
        BROKERAPP_LIST_URL,
        MAIN_APP,
        PENDING_APP,
      );
    });

    test('search by name filters the list', async ({ page }) => {
      await login(page, username, password);
      await verifyBrokerAppSearch(page, TEST_NAMESPACE, BROKERAPP_LIST_URL, MAIN_APP, PENDING_APP);
    });

    test('clicking the provisioned service link navigates to service detail', async ({ page }) => {
      await login(page, username, password);
      await verifyServiceLinkNavigation(
        page,
        TEST_NAMESPACE,
        BROKERAPP_LIST_URL,
        MAIN_APP,
        SERVICE_NAME,
      );
    });

    test('deleting an app removes it from the list', async ({ page }) => {
      await login(page, username, password);
      await verifyDeleteFromList(
        page,
        TEST_NAMESPACE,
        BROKERAPP_LIST_URL,
        'list-app-to-delete',
        MAIN_APP,
      );
    });
  });

  // ── 14. Certificate verification ─────────────────────────────────────────

  test('all PKI secrets and binding secret are present', async () => {
    verifyPKISecrets(TEST_NAMESPACE, SERVICE_NAME, MAIN_APP);
  });

  // ── 15. mTLS message round-trip ───────────────────────────────────────────

  test('producer-consumer message round-trip over mTLS', async () => {
    test.setTimeout(1_800_000);
    await runMTLSRoundTrip(TEST_NAMESPACE, MAIN_APP);
  });

  // ── 16. PKI cleanup ───────────────────────────────────────────────────────
  // Must run last — cleanup invalidates mTLS cluster-wide.

  test('cleanup removes all PKI resources', async () => {
    await verifyPKICleanup();
  });
});
