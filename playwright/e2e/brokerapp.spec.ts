import { test, expect } from '@playwright/test';
import {
  kubectl,
  yarn,
  sleep,
  waitForCondition,
  waitForPod,
  createNamespace,
  deleteNamespace,
  applyYaml,
  secretExists,
} from '../fixtures/k8s';
import { login } from '../fixtures/auth';

// apiVersion used for BrokerApp CRs — must match the installed CRD group.
const BROKERAPP_API = 'broker.arkmq.org/v1beta2';
// BrokerService uses the same API group as BrokerApp.
const BROKERSERVICE_API = 'broker.arkmq.org/v1beta2';

const TEST_NAMESPACE = 'brokerapp-e2e-test';
const SERVICE_NAME = 'e2e-broker-service';

// ── Lifecycle tests (kubectl-only, no browser) ───────────────────────────────

test.describe('BrokerApp lifecycle', () => {
  test.beforeAll(() => {
    test.setTimeout(3_600_000); // 60 minutes

    // PKI infrastructure is required for the broker pod to start.
    // chain-of-trust setup is idempotent — safe to run even if cert-management
    // tests have already run it in this cluster.
    console.log('\nSetting up PKI infrastructure...');
    yarn('chain-of-trust setup', { timeout: 1_200_000 });

    createNamespace(TEST_NAMESPACE);

    // Service cert must exist in the namespace before the BrokerService CR is
    // applied, otherwise the operator will not create the StatefulSet.
    console.log(`\nCreating BrokerService certificate...`);
    yarn(
      `chain-of-trust create-service-cert --name ${SERVICE_NAME} --namespace ${TEST_NAMESPACE}`,
      { timeout: 1_200_000 },
    );

    console.log('\nStarting BrokerApp lifecycle tests\n');
  });

  test.afterAll(() => {
    kubectl(`delete brokerapps --all -n ${TEST_NAMESPACE} --ignore-not-found=true`, {
      ignoreError: true,
    });
    deleteNamespace(TEST_NAMESPACE);
    console.log('\nCleanup complete\n');
  });

  // ── Test: Create app with matching labels → verify it binds to correct service ──

  test('matching labels - binds to correct BrokerService', async ({ page }) => {
    // waitForPod and waitForCondition can each take up to 30 min on a cold CI cluster,
    // so this test needs its own timeout well above the global 8-min default.
    test.setTimeout(3_600_000); // 60 minutes
    const brokerServiceYaml = `
apiVersion: ${BROKERSERVICE_API}
kind: BrokerService
metadata:
  name: ${SERVICE_NAME}
  namespace: ${TEST_NAMESPACE}
  labels:
    tier: e2e
spec:
  resources:
    limits:
      memory: "256Mi"
`;
    applyYaml(brokerServiceYaml);
    console.log(`✓ Applied BrokerService ${SERVICE_NAME} with label tier=e2e`);

    // Allow the operator time to process the CR before checking its status.
    await sleep(10000);
    const brokerStatus = kubectl(
      `get brokerservice ${SERVICE_NAME} -n ${TEST_NAMESPACE} -o jsonpath='{.status.conditions[?(@.type=="Valid")].message}'`,
      { ignoreError: true },
    );
    if (brokerStatus && brokerStatus.includes('failed')) {
      throw new Error(`BrokerService validation failed: ${brokerStatus}`);
    }

    // 1b. Wait for the broker pod to be ready and BrokerService to be deployed
    console.log('\nWaiting for BrokerService to be ready...');
    await waitForPod(`${SERVICE_NAME}-ss-0`, TEST_NAMESPACE, 1800000);
    await waitForCondition(
      'brokerservice',
      SERVICE_NAME,
      TEST_NAMESPACE,
      'Deployed',
      'True',
      1800000,
    );
    console.log(`✓ BrokerService ${SERVICE_NAME} is Deployed`);

    // 2. Create app certificate so the operator can provision the BrokerApp.
    // The cert is resolved by name convention: <appName>-app-cert.
    const appName = 'e2e-app-matching';
    console.log(`\nCreating BrokerApp certificate...`);
    yarn(`chain-of-trust create-app-cert --name ${appName} --namespace ${TEST_NAMESPACE}`, {
      timeout: 1_200_000,
    });
    console.log(`✓ Created app certificate for ${appName}`);

    // 3. Create the BrokerApp via the UI form, selecting the label key/value from
    //    the typeahead dropdowns populated by the live BrokerService in the namespace.
    await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerapps/~new`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

    await page.locator('[data-test="brokerapp-name"]').fill(appName);

    // Open the key typeahead and pick 'tier' — populated from the BrokerService labels.
    await page.getByRole('textbox', { name: 'Label key' }).click();
    await page.getByRole('option', { name: 'tier' }).click();
    // otherwise getValuesForKey hasn't re-run yet and the value listbox will be empty.
    await expect(page.getByRole('textbox', { name: 'Label key' })).toHaveValue('tier');
    console.log('✓ Selected label key "tier" from dropdown');

    // Open the value typeahead and pick 'e2e'.
    await page.getByRole('textbox', { name: 'Label value' }).click();
    await page.getByRole('option', { name: 'e2e' }).click();
    //confirm the value input has updated before submitting the form.
    await expect(page.getByRole('textbox', { name: 'Label value' })).toHaveValue('e2e');
    console.log('✓ Selected label value "e2e" from dropdown');

    await page.locator('[data-test="brokerapp-create-btn"]').click();
    await page.waitForURL('**/broker.arkmq.org~v1beta2~BrokerApp**', { timeout: 30000 });
    console.log(`✓ BrokerApp ${appName} submitted via form with selector tier=e2e`);

    // 3. Wait for the BrokerApp to bind and be provisioned on the broker
    console.log('\nWaiting for BrokerApp to be Deployed (binding + provisioning)...');
    await waitForCondition('brokerapp', appName, TEST_NAMESPACE, 'Deployed', 'True', 1800000);
    console.log(`✓ BrokerApp ${appName} is Deployed`);

    // 4. Verify the status references the expected BrokerService
    const statusOutput = kubectl(
      `get brokerapp ${appName} -n ${TEST_NAMESPACE} -o jsonpath='{.status}'`,
    );
    expect(statusOutput).toContain(SERVICE_NAME);
    console.log(`✓ BrokerApp status references ${SERVICE_NAME}`);

    // 5. Verify the binding secret was created and exposes the expected connection fields
    const secretName = `${appName}-binding-secret`;
    expect(secretExists(secretName, TEST_NAMESPACE)).toBe(true);
    console.log(`✓ Binding secret ${secretName} exists`);

    const secretData = kubectl(
      `get secret ${secretName} -n ${TEST_NAMESPACE} -o jsonpath='{.data}'`,
    );
    const data = JSON.parse(secretData) as Record<string, string>;
    expect(data).toHaveProperty('uri');
    expect(data).toHaveProperty('host');
    expect(data).toHaveProperty('port');
    console.log('✓ Binding secret has expected keys: uri, host, port');
  });

  // ── Test: Add multiple addresses to "Produces To" → verify they all appear in spec ──

  test('multiple producerOf addresses appear in spec', async ({ page }) => {
    const appName = 'e2e-app-multi-produces';
    const addresses = ['QUEUE.ORDERS', 'QUEUE.INVOICES', 'QUEUE.NOTIFICATIONS'];

    // 1. Login and navigate to the create form
    await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerapps/~new`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

    // 2. Fill in the app name
    await page.locator('[data-test="brokerapp-name"]').fill(appName);

    // 3. Add multiple addresses to "Produces To"
    const producerGroup = page.getByRole('list', { name: 'Produces To' });
    for (const addr of addresses) {
      await producerGroup.getByText('Add address').click();
      await page.locator('#brokerapp-produces').fill(addr);
      await page.locator('#brokerapp-produces').press('Enter');
      // Wait for the chip label to appear before adding the next address
      await expect(page.getByText(addr, { exact: true }).first()).toBeVisible({ timeout: 5000 });
    }

    // 4. Submit the form
    await page.locator('[data-test="brokerapp-create-btn"]').click();

    // 5. Wait for redirect to the BrokerApp list
    await page.waitForURL('**/broker.arkmq.org~v1beta2~BrokerApp**', { timeout: 30000 });
    console.log('✓ Form submitted — navigated to BrokerApp list');

    // 6. Verify all addresses are present in the spec via kubectl
    await sleep(2000); // brief pause for the API server to persist the resource
    const capabilitiesJson = kubectl(
      `get brokerapp ${appName} -n ${TEST_NAMESPACE} -o jsonpath='{.spec.capabilities[0].producerOf}'`,
    );
    const producerOf = JSON.parse(capabilitiesJson) as { address: string }[];
    const actualAddresses = producerOf.map((p) => p.address);
    expect(actualAddresses).toHaveLength(addresses.length);
    expect(actualAddresses).toEqual(expect.arrayContaining(addresses));
    console.log(
      `✓ BrokerApp spec contains all ${addresses.length} producerOf addresses: ${addresses.join(
        ', ',
      )}`,
    );
  });

  // ── Test: Create app with private addresses → verify spec.addresses ──────

  test('private addresses with pubSub and subscriptions appear in spec', async ({ page }) => {
    const appName = 'e2e-app-private-addrs';

    await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerapps/~new`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

    await page.locator('[data-test="brokerapp-name"]').fill(appName);

    // 1. Add a plain point-to-point address (no pubSub)
    await page.locator('[data-test="add-private-address-btn"]').click();
    await page.locator('[data-test="private-address-input-0"]').fill('orders.queue');

    // 2. Add a pub/sub address with subscriptions
    await page.locator('[data-test="add-private-address-btn"]').click();
    await page.locator('[data-test="private-address-input-1"]').fill('events.topic');
    // PatternFly Switch renders a decorative <span> over the <input> that
    // intercepts pointer events. Click the visible <label> instead.
    await page.locator('label[for="private-address-pubsub-1"]').click();

    // Add two subscriptions
    await page.getByText('Add subscription').click();
    const subInput = page.getByPlaceholder('e.g., my-subscription');
    await subInput.fill('durable-sub-a');
    await subInput.press('Enter');
    await expect(page.getByText('durable-sub-a')).toBeVisible({ timeout: 5000 });

    await page.getByText('Add subscription').click();
    const subInput2 = page.getByPlaceholder('e.g., my-subscription');
    await subInput2.fill('durable-sub-b');
    await subInput2.press('Enter');
    await expect(page.getByText('durable-sub-b')).toBeVisible({ timeout: 5000 });

    // 3. Submit the form
    await page.locator('[data-test="brokerapp-create-btn"]').click();
    await page.waitForURL('**/broker.arkmq.org~v1beta2~BrokerApp**', { timeout: 30000 });
    console.log('✓ Form submitted — navigated to BrokerApp list');

    // 4. Verify spec.addresses via kubectl
    await sleep(2000);
    const addressesJson = kubectl(
      `get brokerapp ${appName} -n ${TEST_NAMESPACE} -o jsonpath='{.spec.addresses}'`,
    );
    const addresses = JSON.parse(addressesJson) as {
      address: string;
      pubSub?: boolean;
      subscriptions?: string[];
    }[];

    expect(addresses).toHaveLength(2);

    const plainEntry = addresses.find((a) => a.address === 'orders.queue');
    expect(plainEntry).toBeDefined();
    expect(plainEntry?.pubSub).toBeUndefined();
    expect(plainEntry?.subscriptions).toBeUndefined();
    console.log('✓ Plain address "orders.queue" present without pubSub');

    const pubSubEntry = addresses.find((a) => a.address === 'events.topic');
    expect(pubSubEntry).toBeDefined();
    expect(pubSubEntry?.pubSub).toBe(true);
    expect(pubSubEntry?.subscriptions).toEqual(
      expect.arrayContaining(['durable-sub-a', 'durable-sub-b']),
    );
    expect(pubSubEntry?.subscriptions).toHaveLength(2);
    console.log('✓ Pub/sub address "events.topic" present with subscriptions');
  });

  // ── Test: Duplicate private address shows validation error ──────────────────

  test('duplicate private address shows inline validation error', async ({ page }) => {
    await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerapps/~new`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

    // Add two entries with the same address
    await page.locator('[data-test="add-private-address-btn"]').click();
    await page.locator('[data-test="add-private-address-btn"]').click();
    await page.locator('[data-test="private-address-input-0"]').fill('duplicate.addr');
    await page.locator('[data-test="private-address-input-1"]').fill('duplicate.addr');
    await page.locator('[data-test="private-address-input-1"]').blur();

    await expect(page.getByText('Duplicate address')).toBeVisible({ timeout: 5000 });
    console.log('✓ Duplicate address validation error is visible');

    // Verify the Create button is disabled
    await expect(page.locator('[data-test="brokerapp-create-btn"]')).toBeDisabled();
    console.log('✓ Create button is disabled with duplicate address');
  });

  // ── Test: Create app with non-matching labels → verify it stays pending ──────

  test('non-matching labels - BrokerApp stays pending', async () => {
    const appName = 'e2e-app-nomatch';
    const brokerAppYaml = `
apiVersion: ${BROKERAPP_API}
kind: BrokerApp
metadata:
  name: ${appName}
  namespace: ${TEST_NAMESPACE}
spec:
  selector:
    matchLabels:
      tier: does-not-exist
  capabilities:
  - consumerOf:
    - address: "QUEUE.TEST"
`;
    applyYaml(brokerAppYaml);
    console.log(`✓ Applied BrokerApp ${appName} with non-matching selector`);

    // Give the operator enough time to reconcile
    console.log('Waiting 30s for operator to reconcile...');
    await sleep(30000);

    // Deployed condition must NOT be True
    const conditions = kubectl(
      `get brokerapp ${appName} -n ${TEST_NAMESPACE} -o jsonpath='{.status.conditions}'`,
      { ignoreError: true },
    );
    if (conditions) {
      const conditionsArray = JSON.parse(conditions) as { type: string; status: string }[];
      const deployed = conditionsArray.find((c) => c.type === 'Deployed');
      expect(deployed?.status).not.toBe('True');
      console.log('✓ Deployed condition is not True (BrokerApp is pending)');
    } else {
      // No conditions yet — operator has not bound it, which is the expected state
      console.log('✓ No conditions present — BrokerApp is still pending');
    }

    // No binding secret should have been created
    expect(secretExists(`${appName}-binding-secret`, TEST_NAMESPACE)).toBe(false);
    console.log('✓ No binding secret created for unbound BrokerApp');
  });

  // ── List page UI tests ──────────────────────────────────────────────────────
  // Nested inside the lifecycle describe so these tests run before the afterAll
  // deletes the namespace. Reuses e2e-app-matching (provisioned, bound to
  // e2e-broker-service) and e2e-app-nomatch (pending) from the tests above.

  test.describe('BrokerApp list page', () => {
    const PROVISIONED_APP = 'e2e-app-matching';
    const PENDING_APP = 'e2e-app-nomatch';

    const LIST_URL = `/k8s/ns/${TEST_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerApp`;

    // ── Test: all apps appear in the list ─────────────────────────────────

    test('provisioned and pending apps both appear in the list', async ({ page }) => {
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(
        `[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`,
        {
          timeout: 30000,
        },
      );

      await expect(
        page.locator(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${PENDING_APP}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-test="brokerapp-status-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`),
      ).toHaveText('Deployed');
      await expect(
        page.locator(`[data-test="brokerapp-status-${TEST_NAMESPACE}-${PENDING_APP}"]`),
      ).toHaveText('Pending');
      console.log(`✓ Both ${PROVISIONED_APP} and ${PENDING_APP} visible in list`);
    });

    // ── Test: name filter hides non-matching rows ──────────────────────────

    test('search by name filters the list', async ({ page }) => {
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(
        `[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`,
        {
          timeout: 30000,
        },
      );

      // Target the actual <input> inside the PatternFly TextInputGroup wrapper.
      await page.locator('[data-test="brokerapp-search"] input').fill('matching');

      await expect(
        page.locator(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`),
      ).toBeVisible();
      await expect(
        page.locator(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${PENDING_APP}"]`),
      ).not.toBeVisible();
      console.log(`✓ Name filter "matching" shows only ${PROVISIONED_APP}`);
    });

    // ── Test: provisioned service link navigates to service detail ─────────

    test('clicking the provisioned service link navigates to service detail', async ({ page }) => {
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(
        `[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`,
        {
          timeout: 30000,
        },
      );

      // The ResourceLink in the provisioned service column carries
      // data-test="provisioned-service-link-<appName>" set in BrokerAppListRow.
      const serviceLink = page.locator(`[data-test="provisioned-service-link-${PROVISIONED_APP}"]`);
      await expect(serviceLink).toBeVisible({ timeout: 30000 });

      await serviceLink.click();

      await expect(page).toHaveURL(new RegExp(SERVICE_NAME), { timeout: 15000 });
      console.log(`✓ Clicking provisioned service link navigated to ${SERVICE_NAME} detail`);
    });

    // ── Test: delete an app → it disappears from the list ─────────────────
    // Creates its own throwaway app so neither lifecycle app is touched.
    test('deleting an app removes it from the list', async ({ page }) => {
      const appToDelete = 'list-app-to-delete';

      applyYaml(`
apiVersion: ${BROKERAPP_API}
kind: BrokerApp
metadata:
  name: ${appToDelete}
  namespace: ${TEST_NAMESPACE}
spec:
  selector:
    matchLabels:
      tier: delete-test
`);
      console.log(`✓ Created ${appToDelete} for delete test`);

      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(
        `[data-test="brokerapp-link-${TEST_NAMESPACE}-${PROVISIONED_APP}"]`,
        {
          timeout: 30000,
        },
      );
      await page.waitForSelector(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${appToDelete}"]`, {
        timeout: 30000,
      });

      // Delete via kubectl — the list reflects the deletion via the console watch stream.
      kubectl(`delete brokerapp ${appToDelete} -n ${TEST_NAMESPACE}`);
      console.log(`✓ Deleted ${appToDelete} via kubectl`);

      await expect(
        page.locator(`[data-test="brokerapp-link-${TEST_NAMESPACE}-${appToDelete}"]`),
      ).not.toBeVisible({
        timeout: 30000,
      });
      console.log(`✓ ${appToDelete} row removed from list after deletion`);
    });
  });

  // ── Details page UI tests ───────────────────────────────────────────────────
  // Reuses apps created by lifecycle tests above — no new cluster resources needed.

  test.describe('BrokerApp details page', () => {
    const PROVISIONED_APP = 'e2e-app-matching';
    const DETAILS_URL = `/k8s/ns/${TEST_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerApp/${PROVISIONED_APP}`;

    // ── Test: provisioned app shows broker host and port ──────────────────

    test('provisioned app shows broker host and port in connection information', async ({
      page,
    }) => {
      const expectedHost = `${SERVICE_NAME}.${TEST_NAMESPACE}.svc.cluster.local`;
      const expectedPort = kubectl(
        `get brokerapp ${PROVISIONED_APP} -n ${TEST_NAMESPACE} -o jsonpath='{.status.service.assignedPort}'`,
      );

      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(DETAILS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test="broker-app-overview-tab"]', { timeout: 30000 });

      // ClipboardCopy renders the value inside an <input> — assert via its value.
      await expect(page.locator('[data-test="broker-app-connection-host"] input')).toHaveValue(
        expectedHost,
        { timeout: 15000 },
      );
      await expect(page.locator('[data-test="broker-app-connection-port"] input')).toHaveValue(
        expectedPort,
        { timeout: 15000 },
      );
      console.log(`✓ Connection info shows host=${expectedHost} port=${expectedPort}`);
    });

    // ── Test: copy button copies host value to clipboard ──────────────────

    test('copy button copies broker host to clipboard', async ({ page, context }) => {
      const expectedHost = `${SERVICE_NAME}.${TEST_NAMESPACE}.svc.cluster.local`;

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(DETAILS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test="broker-app-connection-host"]', { timeout: 30000 });

      // PatternFly ClipboardCopy renders a copy button as the last button in the group.
      const copyButton = page
        .locator('[data-test="broker-app-connection-host"]')
        .getByRole('button');
      await copyButton.click();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toBe(expectedHost);
      console.log(`✓ Clipboard contains expected host: ${expectedHost}`);
    });

    // ── Test: provisioned service link in page header navigates to service detail ──

    test('provisioned service link in details header navigates to service detail', async ({
      page,
    }) => {
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(DETAILS_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test="broker-app-provisioned-service"]', {
        timeout: 30000,
      });

      await page.locator('[data-test="broker-app-provisioned-service"] a').click();
      await expect(page).toHaveURL(new RegExp(SERVICE_NAME), { timeout: 15000 });
      console.log(`✓ Provisioned service link navigated to ${SERVICE_NAME} detail`);
    });

    // ── Test: messaging capabilities shows addresses in correct sections ───
    // Depends on 'multiple producerOf addresses appear in spec' having run first and
    // created e2e-app-multi-produces with QUEUE.ORDERS/INVOICES/NOTIFICATIONS in producerOf.

    test('messaging capabilities shows producer addresses and empty consumer section', async ({
      page,
    }) => {
      const appName = 'e2e-app-multi-produces';
      const producerAddresses = ['QUEUE.ORDERS', 'QUEUE.INVOICES', 'QUEUE.NOTIFICATIONS'];

      const appDetailsUrl = `/k8s/ns/${TEST_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerApp/${appName}`;
      await login(page, 'kubeadmin', process.env.KUBEADMIN_PASSWORD || 'kubeadmin');
      await page.goto(appDetailsUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test="broker-app-messaging-capabilities"]', {
        timeout: 30000,
      });

      for (const addr of producerAddresses) {
        await expect(page.locator(`[data-test="producer-address-${addr}"]`)).toBeVisible({
          timeout: 15000,
        });
        console.log(`✓ Producer address "${addr}" visible in Produces To`);
      }

      await expect(
        page
          .locator('[data-test="broker-app-messaging-capabilities"]')
          .getByText('No addresses configured'),
      ).toBeVisible({ timeout: 15000 });
      console.log(`✓ Consumes From shows empty state`);

      // Confirm no producer address leaks into the consumer section.
      for (const addr of producerAddresses) {
        await expect(page.locator(`[data-test="consumer-address-${addr}"]`)).not.toBeVisible();
      }
      console.log(`✓ No producer address appears in Consumes From`);
    });
  });
});
