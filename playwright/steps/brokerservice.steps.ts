/** Step functions for BrokerService E2E scenarios. */
import { expect, type Page } from '@playwright/test';
import { kubectl, yarn, waitForCondition, getResource } from '../fixtures/k8s';

const BROKERSERVICE_API = 'broker.arkmq.org/v1beta2';

function brokerServiceListPath(namespace: string): string {
  return `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerService`;
}

/**
 * Creates a TLS cert for the BrokerService via chain-of-trust.
 * Must exist before applying the BrokerService CR — the operator won't create the StatefulSet without it.
 */
export function createServiceCert(name: string, namespace: string): void {
  yarn(`chain-of-trust create-service-cert --name ${name} --namespace ${namespace}`, {
    timeout: 1_200_000,
  });
  console.log(`✓ BrokerService certificate created for ${name}`);
}

/** Creates a BrokerService via the UI form and waits for Deployed=True. */
export async function createBrokerServiceViaForm(
  page: Page,
  name: string,
  namespace: string,
): Promise<void> {
  await page.goto(`/k8s/ns/${namespace}/brokerservices/~new`, { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('h1', { hasText: 'Create BrokerService' })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator('[data-test="form-view-input"]')).toBeChecked();

  await page.locator('[data-test="broker-service-name-input"]').fill(name);

  const namespaceInput = page.locator('[data-test="broker-service-namespace-input"]');
  await expect(namespaceInput).toHaveValue(namespace);
  await expect(namespaceInput).toBeDisabled();

  await page.locator('[data-test="memory-value-input"]').fill('256');
  await page.getByRole('button', { name: /^(Mi|Gi)$/ }).click();
  await page.getByRole('menuitem', { name: 'Mi' }).click();

  await page.locator('[data-test="create-broker-service-button"]').click();
  await page.waitForURL(/(?!.*~new)/, { timeout: 30000 });
  console.log(`✓ BrokerService ${name} submitted via form`);

  console.log(`\nWaiting for BrokerService ${name} to be Deployed...`);
  await waitForCondition('brokerservice', name, namespace, 'Deployed', 'True', 1_800_000);
  console.log(`✓ BrokerService ${name} is Deployed`);

  const resource = getResource('brokerservice', name, namespace);
  const metadata = resource.metadata as { name: string; namespace: string };
  expect(metadata.name).toBe(name);
  expect(metadata.namespace).toBe(namespace);
  console.log('✓ BrokerService spec matches form input');
}

/**
 * Patches labels onto an existing BrokerService.
 * Used for labels the UI form does not expose (e.g. selector labels for BrokerApp typeaheads).
 */
export function patchBrokerServiceLabels(
  name: string,
  namespace: string,
  labels: Record<string, string>,
): void {
  const labelArgs = Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  kubectl(`label brokerservice ${name} ${labelArgs} -n ${namespace}`);
  console.log(`✓ Patched labels (${labelArgs}) onto BrokerService ${name}`);
}

/** Navigates to the list page, verifies the service appears with a status badge, then navigates to the detail page. */
export async function verifyBrokerServiceList(
  page: Page,
  namespace: string,
  name: string,
): Promise<void> {
  await page.goto(brokerServiceListPath(namespace), { waitUntil: 'domcontentloaded' });

  await expect(page.locator(`[data-test="broker-service-link-${namespace}-${name}"]`)).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.locator(`[data-test="broker-service-status-${namespace}-${name}"]`),
  ).toBeVisible();
  console.log(`✓ BrokerService ${name} visible in list`);

  await page.locator(`[data-test="broker-service-link-${namespace}-${name}"]`).click();
  await page.waitForURL(new RegExp(`/k8s/ns/${namespace}/.*${name}(?!.*~new)`), {
    timeout: 30000,
  });
  await expect(page.locator('h1')).toContainText(name);
  console.log(`✓ Name link navigates to BrokerService detail page`);
}

/**
 * Creates a BrokerService via the YAML editor, verifies the spec, then deletes it.
 * Self-contained test of the YAML editor UI path — does not affect the shared suite service.
 */
export async function createBrokerServiceViaYaml(page: Page, namespace: string): Promise<void> {
  const yamlServiceName = 'yaml-test-broker';

  await page.goto(`/k8s/ns/${namespace}/brokerservices/~new`, { waitUntil: 'load' });
  await page.waitForLoadState('domcontentloaded');

  await expect(page.locator('h1', { hasText: 'Create BrokerService' })).toBeVisible({
    timeout: 30000,
  });

  console.log('  Switching to YAML view...');
  await page.locator('[data-test="yaml-view-input"]').click();
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

  const yamlContent = [
    `apiVersion: ${BROKERSERVICE_API}`,
    'kind: BrokerService',
    'metadata:',
    `  name: ${yamlServiceName}`,
    `  namespace: ${namespace}`,
    '  labels:',
    '    env: test',
    'spec:',
    '  resources:',
    '    limits:',
    '      memory: 512Mi',
  ].join('\n');

  await page.evaluate((yaml) => {
    const editor = (window as unknown as Record<string, unknown>).monaco as
      | { editor: { getEditors: () => { setValue: (v: string) => void }[] } }
      | undefined;
    if (editor) {
      const editors = editor.editor.getEditors();
      if (editors.length > 0) {
        editors[0].setValue(yaml);
      }
    }
  }, yamlContent);

  await page.waitForTimeout(1000);

  console.log('  Submitting via YAML editor Create button...');
  await page.locator('[data-test="save-changes"]').click();
  await page.waitForURL(/(?!.*~new)/, { timeout: 30000 });

  console.log('  Waiting for BrokerService to be valid...');
  await waitForCondition('brokerservice', yamlServiceName, namespace, 'Valid', 'True', 120000);

  console.log('  Verifying resource spec matches YAML input...');
  const resource = getResource('brokerservice', yamlServiceName, namespace);
  expect(resource).toBeDefined();

  const metadata = resource.metadata as {
    name: string;
    namespace: string;
    labels?: Record<string, string>;
  };
  expect(metadata.name).toBe(yamlServiceName);
  expect(metadata.namespace).toBe(namespace);
  expect(metadata.labels?.env).toBe('test');

  const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
  expect(spec.resources?.limits?.memory).toBe('512Mi');
  console.log(`✓ BrokerService ${yamlServiceName} created via YAML with memory=512Mi`);

  kubectl(`delete brokerservice ${yamlServiceName} -n ${namespace} --ignore-not-found=true`);
  console.log(`✓ Cleaned up ${yamlServiceName}`);
}

/** Navigates from the list page to the detail page and verifies the page header. Shared by detail page steps. */
async function openBrokerServiceDetails(
  page: Page,
  namespace: string,
  name: string,
): Promise<void> {
  await page.goto(brokerServiceListPath(namespace), { waitUntil: 'load' });
  await page.waitForURL(`**${brokerServiceListPath(namespace)}**`, { timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Create BrokerService' })).toBeVisible({
    timeout: 30000,
  });

  await page.locator(`[data-test="broker-service-link-${namespace}-${name}"]`).click();
  await page.waitForURL(new RegExp(`/k8s/ns/${namespace}/.*${name}(?!.*~new)`), {
    timeout: 30000,
  });
  await expect(page.locator('[role="progressbar"]')).toHaveCount(0, { timeout: 30000 });
  await expect(page.locator('[data-test="broker-service-details-title"]')).toContainText(name, {
    timeout: 15000,
  });
  await expect(page.locator('[data-test="resource-details-favorite-button"]')).toBeVisible();
  await expect(
    page.locator(`[data-test="broker-service-details-actions-${namespace}-${name}"]`),
  ).toBeVisible();
}

/**
 * Verifies the Overview tab shows breadcrumb, status badge, and expected cluster labels.
 *
 * @param expectedLabels - Label strings expected on the tab (e.g. ['tier=e2e', 'app=messaging'])
 */
export async function verifyBrokerServiceOverviewTab(
  page: Page,
  namespace: string,
  name: string,
  expectedLabels: string[],
): Promise<void> {
  await openBrokerServiceDetails(page, namespace, name);

  await expect(page.locator('[data-test="broker-service-details-breadcrumb"]')).toBeVisible();
  await expect(
    page.locator(`[data-test="broker-service-details-status-${namespace}-${name}"]`),
  ).toBeVisible();
  await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();

  await expect(page.locator('[data-test="resource-labels-and-annotations"]')).toBeVisible();
  for (const label of expectedLabels) {
    await expect(page.getByText(label)).toBeVisible();
  }
  console.log(
    `✓ BrokerService ${name} Overview tab verified with labels: ${expectedLabels.join(', ')}`,
  );
}

/** Verifies switching between the Overview and YAML tabs renders the correct content each time. */
export async function verifyBrokerServiceTabSwitching(
  page: Page,
  namespace: string,
  name: string,
): Promise<void> {
  await openBrokerServiceDetails(page, namespace, name);

  await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();

  await page.getByRole('tab', { name: 'YAML' }).click();
  await expect(page.locator('[data-test="broker-service-yaml-tab"]')).toBeVisible();

  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();
  console.log(`✓ BrokerService ${name} tab switching verified (Overview ↔ YAML)`);
}
