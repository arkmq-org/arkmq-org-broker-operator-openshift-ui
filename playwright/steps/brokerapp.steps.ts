/** Step functions for BrokerApp E2E scenarios. */
import { expect, type Page } from '@playwright/test';
import { kubectl, yarn, sleep, waitForCondition, applyYaml, secretExists } from '../fixtures/k8s';

const BROKERAPP_API = 'broker.arkmq.org/v1beta2';

/**
 * Creates a TLS cert for a BrokerApp via chain-of-trust.
 * Must exist before the operator can provision the app on the broker.
 */
export function createAppCert(name: string, namespace: string): void {
  yarn(`chain-of-trust create-app-cert --name ${name} --namespace ${namespace}`, {
    timeout: 1_200_000,
  });
  console.log(`✓ BrokerApp certificate created for ${name}`);
}

/**
 * Creates a BrokerApp via the UI form with label selector typeaheads, waits for Deployed=True,
 * and verifies the binding secret.
 *
 * @param labelKey - Label key selected from the typeahead (populated from live BrokerService labels)
 * @param labelValue - Label value selected from the typeahead
 * @param serviceName - Expected BrokerService name in the app's status
 */
export async function createBrokerAppViaForm(
  page: Page,
  namespace: string,
  appName: string,
  labelKey: string,
  labelValue: string,
  serviceName: string,
): Promise<void> {
  await page.goto(`/k8s/ns/${namespace}/brokerapps/~new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

  await page.locator('[data-test="brokerapp-name"]').fill(appName);

  await page.getByRole('textbox', { name: 'Label key' }).click();
  await page.getByRole('option', { name: labelKey }).click();
  await expect(page.getByRole('textbox', { name: 'Label key' })).toHaveValue(labelKey);

  await page.getByRole('textbox', { name: 'Label value' }).click();
  await page.getByRole('option', { name: labelValue }).click();
  await expect(page.getByRole('textbox', { name: 'Label value' })).toHaveValue(labelValue);

  const producerGroup = page.getByRole('list', { name: 'Produces To' });
  await producerGroup.getByText('Add address').click();
  await page.locator('#brokerapp-produces').fill('APP.JOBS');
  await page.locator('#brokerapp-produces').press('Enter');
  await expect(page.getByText('APP.JOBS', { exact: true }).first()).toBeVisible({ timeout: 5000 });

  const consumerGroup = page.getByRole('list', { name: 'Consumes From' });
  await consumerGroup.getByText('Add address').click();
  await page.locator('#brokerapp-consumes').fill('APP.JOBS');
  await page.locator('#brokerapp-consumes').press('Enter');
  await expect(page.getByText('APP.JOBS', { exact: true }).first()).toBeVisible({ timeout: 5000 });

  await page.locator('[data-test="brokerapp-create-btn"]').click();
  await page.waitForURL('**/broker.arkmq.org~v1beta2~BrokerApp**', { timeout: 30000 });
  console.log(`✓ BrokerApp ${appName} submitted via form with selector ${labelKey}=${labelValue}`);

  await waitForCondition('brokerapp', appName, namespace, 'Deployed', 'True', 1_800_000);
  console.log(`✓ BrokerApp ${appName} is Deployed`);

  verifyBrokerAppBinding(appName, namespace, serviceName);
}

/** Verifies the BrokerApp status references the expected service and binding secret has uri/host/port. */
export function verifyBrokerAppBinding(
  appName: string,
  namespace: string,
  serviceName: string,
): void {
  const statusOutput = kubectl(`get brokerapp ${appName} -n ${namespace} -o jsonpath='{.status}'`);
  expect(statusOutput).toContain(serviceName);
  console.log(`✓ BrokerApp status references ${serviceName}`);

  const secretName = `${appName}-binding-secret`;
  expect(secretExists(secretName, namespace)).toBe(true);

  const secretData = kubectl(`get secret ${secretName} -n ${namespace} -o jsonpath='{.data}'`);
  const data = JSON.parse(secretData) as Record<string, string>;
  expect(data).toHaveProperty('uri');
  expect(data).toHaveProperty('host');
  expect(data).toHaveProperty('port');
  console.log('✓ Binding secret has expected keys: uri, host, port');
}

/** Creates a BrokerApp with multiple producerOf addresses via the UI form and verifies all appear in the spec. */
export async function createBrokerAppWithProducerAddresses(
  page: Page,
  namespace: string,
  appName: string,
  addresses: string[],
): Promise<void> {
  await page.goto(`/k8s/ns/${namespace}/brokerapps/~new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test="create-brokerapp-title"]', { timeout: 30000 });

  await page.locator('[data-test="brokerapp-name"]').fill(appName);

  const producerGroup = page.getByRole('list', { name: 'Produces To' });
  for (const addr of addresses) {
    await producerGroup.getByText('Add address').click();
    await page.locator('#brokerapp-produces').fill(addr);
    await page.locator('#brokerapp-produces').press('Enter');
    await expect(page.getByText(addr, { exact: true }).first()).toBeVisible({ timeout: 5000 });
  }

  await page.locator('[data-test="brokerapp-create-btn"]').click();
  await page.waitForURL('**/broker.arkmq.org~v1beta2~BrokerApp**', { timeout: 30000 });

  await sleep(2000);
  const capabilitiesJson = kubectl(
    `get brokerapp ${appName} -n ${namespace} -o jsonpath='{.spec.capabilities[0].producerOf}'`,
  );
  const producerOf = JSON.parse(capabilitiesJson) as { address: string }[];
  const actualAddresses = producerOf.map((p) => p.address);
  expect(actualAddresses).toHaveLength(addresses.length);
  expect(actualAddresses).toEqual(expect.arrayContaining(addresses));
  console.log(`✓ BrokerApp spec contains all ${addresses.length} producerOf addresses`);
}

/** Applies a BrokerApp with a non-matching selector and verifies it stays Pending with no binding secret. */
export async function createPendingBrokerApp(namespace: string, appName: string): Promise<void> {
  applyYaml(`
apiVersion: ${BROKERAPP_API}
kind: BrokerApp
metadata:
  name: ${appName}
  namespace: ${namespace}
spec:
  selector:
    matchLabels:
      tier: does-not-exist
  capabilities:
  - consumerOf:
    - address: "QUEUE.TEST"
`);
  console.log(`✓ Applied ${appName} with non-matching selector`);

  console.log('Waiting 30s for operator to reconcile...');
  await sleep(30000);

  const conditions = kubectl(
    `get brokerapp ${appName} -n ${namespace} -o jsonpath='{.status.conditions}'`,
    { ignoreError: true },
  );
  if (conditions) {
    const conditionsArray = JSON.parse(conditions) as { type: string; status: string }[];
    const deployed = conditionsArray.find((c) => c.type === 'Deployed');
    expect(deployed?.status).not.toBe('True');
    console.log('✓ Deployed condition is not True (BrokerApp is pending)');
  } else {
    console.log('✓ No conditions present — BrokerApp is still pending');
  }

  expect(secretExists(`${appName}-binding-secret`, namespace)).toBe(false);
  console.log('✓ No binding secret created for unbound BrokerApp');
}

/** Navigates to the list and verifies both the provisioned (Deployed) and pending apps appear with correct status badges. */
export async function verifyBrokerAppListVisibility(
  page: Page,
  namespace: string,
  listUrl: string,
  provisioned: string,
  pending: string,
): Promise<void> {
  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test="brokerapp-link-${namespace}-${provisioned}"]`, {
    timeout: 30000,
  });

  await expect(
    page.locator(`[data-test="brokerapp-link-${namespace}-${provisioned}"]`),
  ).toBeVisible();
  await expect(page.locator(`[data-test="brokerapp-link-${namespace}-${pending}"]`)).toBeVisible();
  await expect(
    page.locator(`[data-test="brokerapp-status-${namespace}-${provisioned}"]`),
  ).toHaveText('Deployed');
  await expect(page.locator(`[data-test="brokerapp-status-${namespace}-${pending}"]`)).toHaveText(
    'Pending',
  );
  console.log(`✓ Both ${provisioned} (Deployed) and ${pending} (Pending) visible in list`);
}

/** Verifies the name search filter shows the provisioned app and hides the pending one. */
export async function verifyBrokerAppSearch(
  page: Page,
  namespace: string,
  listUrl: string,
  provisioned: string,
  pending: string,
): Promise<void> {
  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test="brokerapp-link-${namespace}-${provisioned}"]`, {
    timeout: 30000,
  });

  await page.locator('[data-test="brokerapp-search"] input').fill('matching');

  await expect(
    page.locator(`[data-test="brokerapp-link-${namespace}-${provisioned}"]`),
  ).toBeVisible();
  await expect(
    page.locator(`[data-test="brokerapp-link-${namespace}-${pending}"]`),
  ).not.toBeVisible();
  console.log(`✓ Name filter "matching" shows only ${provisioned}`);
}

/** Clicks the provisioned service link and verifies navigation to the BrokerService detail page. */
export async function verifyServiceLinkNavigation(
  page: Page,
  namespace: string,
  listUrl: string,
  appName: string,
  serviceName: string,
): Promise<void> {
  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test="brokerapp-link-${namespace}-${appName}"]`, {
    timeout: 30000,
  });

  const serviceLink = page.locator(`[data-test="provisioned-service-link-${appName}"]`);
  await expect(serviceLink).toBeVisible({ timeout: 30000 });
  await serviceLink.click();
  await expect(page).toHaveURL(new RegExp(serviceName), { timeout: 15000 });
  console.log(`✓ Provisioned service link navigated to ${serviceName} detail`);
}

/**
 * Creates a throwaway app, deletes it via kubectl, and verifies the row disappears from the list.
 *
 * @param anchorApp - An already-visible app used to confirm the list has loaded before checking the deletable one
 */
export async function verifyDeleteFromList(
  page: Page,
  namespace: string,
  listUrl: string,
  appToDelete: string,
  anchorApp: string,
): Promise<void> {
  applyYaml(`
apiVersion: ${BROKERAPP_API}
kind: BrokerApp
metadata:
  name: ${appToDelete}
  namespace: ${namespace}
spec:
  selector:
    matchLabels:
      tier: delete-test
`);
  console.log(`✓ Created ${appToDelete} for delete test`);

  await page.goto(listUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`[data-test="brokerapp-link-${namespace}-${anchorApp}"]`, {
    timeout: 30000,
  });
  await page.waitForSelector(`[data-test="brokerapp-link-${namespace}-${appToDelete}"]`, {
    timeout: 30000,
  });

  kubectl(`delete brokerapp ${appToDelete} -n ${namespace}`);
  console.log(`✓ Deleted ${appToDelete} via kubectl`);

  await expect(
    page.locator(`[data-test="brokerapp-link-${namespace}-${appToDelete}"]`),
  ).not.toBeVisible({ timeout: 30000 });
  console.log(`✓ ${appToDelete} row removed from list after deletion`);
}
