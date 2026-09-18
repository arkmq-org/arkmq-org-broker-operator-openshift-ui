import { test, expect, type Page } from '@playwright/test';
import { login } from '../fixtures/auth';
import {
  kubectl,
  createNamespace,
  deleteNamespace,
  getResource,
  waitForCondition,
  applyYaml,
} from '../fixtures/k8s';

const username = 'kubeadmin';
const password = process.env.KUBEADMIN_PASSWORD || 'kubeadmin';

const BROKERSERVICE_API = 'broker.arkmq.org/v1beta2';
const TEST_NAMESPACE = 'broker-service-e2e';
const SERVICE_NAME = 'test-broker';

const BROKERSERVICE_LIST_PATH = (namespace: string) =>
  `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerService`;

async function gotoBrokerServiceList(page: Page, namespace: string) {
  await page.goto(BROKERSERVICE_LIST_PATH(namespace), { waitUntil: 'load' });
  await page.waitForURL(`**${BROKERSERVICE_LIST_PATH(namespace)}**`, { timeout: 30000 });
  await expect(page.getByRole('link', { name: 'Create BrokerService' })).toBeVisible({
    timeout: 30000,
  });
}

function brokerServiceYaml(name: string, namespace: string, labels?: Record<string, string>) {
  const labelLines = labels
    ? Object.entries(labels).map(([key, value]) => `    ${key}: ${value}`)
    : [];
  return [
    `apiVersion: ${BROKERSERVICE_API}`,
    'kind: BrokerService',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    ...(labelLines.length > 0 ? ['  labels:', ...labelLines] : []),
    'spec:',
    '  resources:',
    '    limits:',
    '      memory: 2Gi',
  ].join('\n');
}

test.describe('BrokerService Creation Form', () => {
  test.beforeAll(() => {
    createNamespace(TEST_NAMESPACE);
    console.log('\nStarting BrokerService Creation Form tests\n');
  });

  test.afterAll(() => {
    kubectl(`delete brokerservice --all -n ${TEST_NAMESPACE}`, { ignoreError: true });
    deleteNamespace(TEST_NAMESPACE);
    console.log('\nCleanup complete\n');
  });

  test.afterEach(() => {
    kubectl(`delete brokerservice --all -n ${TEST_NAMESPACE}`, { ignoreError: true });
  });

  // ── Test 1: Create service with valid inputs → verify success ──────────────

  test('create service with valid inputs and verify success', async ({ page }) => {
    await login(page, username, password);

    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerservices/~new`, {
      waitUntil: 'load',
    });
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('h1', { hasText: 'Create BrokerService' })).toBeVisible({
      timeout: 30000,
    });

    // Verify Form View is selected by default
    console.log('  Verifying Form View is selected by default...');
    await expect(page.locator('[data-test="form-view-input"]')).toBeChecked();

    // Fill in name
    await page.locator('[data-test="broker-service-name-input"]').fill(SERVICE_NAME);

    // Verify namespace is pre-filled and read-only
    console.log(`  Verifying namespace ${TEST_NAMESPACE} is pre-filled and read-only...`);
    const namespaceInput = page.locator('[data-test="broker-service-namespace-input"]');
    await expect(namespaceInput).toHaveValue(TEST_NAMESPACE);
    await expect(namespaceInput).toBeDisabled();

    // Click Create
    await page.locator('[data-test="create-broker-service-button"]').click();

    // Wait for navigation (form submits and navigates back)
    console.log('  Waiting for form submission and navigation...');
    await page.waitForURL(/(?!.*~new)/, { timeout: 30000 });

    console.log('  Waiting for BrokerService to be valid...');
    await waitForCondition('brokerservice', SERVICE_NAME, TEST_NAMESPACE, 'Valid', 'True', 120000);

    // Verify the resource spec matches what was submitted via form
    console.log('  Verifying resource spec matches form input...');
    const resource = getResource('brokerservice', SERVICE_NAME, TEST_NAMESPACE);
    expect(resource).toBeDefined();

    const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
    expect(spec.resources?.limits?.memory).toBe('2Gi');

    const metadata = resource.metadata as { name: string; namespace: string };
    expect(metadata.name).toBe(SERVICE_NAME);
    expect(metadata.namespace).toBe(TEST_NAMESPACE);

    console.log(`\n✓ BrokerService ${SERVICE_NAME} created via form with memory=2Gi`);
  });

  // ── Test 2: Create service via YAML → verify it matches form-created resource ──

  test('create service via YAML and verify resource matches expected spec', async ({ page }) => {
    await login(page, username, password);

    await page.goto(`/k8s/ns/${TEST_NAMESPACE}/brokerservices/~new`, {
      waitUntil: 'load',
    });
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('h1', { hasText: 'Create BrokerService' })).toBeVisible({
      timeout: 30000,
    });

    // Switch to YAML view
    console.log('  Switching to YAML view...');
    await page.locator('[data-test="yaml-view-input"]').click();
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15000 });

    const yamlServiceName = 'yaml-test-broker';
    const yamlContent = [
      `apiVersion: ${BROKERSERVICE_API}`,
      'kind: BrokerService',
      'metadata:',
      `  name: ${yamlServiceName}`,
      `  namespace: ${TEST_NAMESPACE}`,
      '  labels:',
      '    env: test',
      'spec:',
      '  resources:',
      '    limits:',
      '      memory: 512Mi',
    ].join('\n');

    // Use Monaco's API to set content reliably
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

    // Give the onChange handler time to process
    await page.waitForTimeout(1000);

    // Click the editor's built-in Create button
    console.log('  Submitting via YAML editor Create button...');
    await page.locator('[data-test="save-changes"]').click();
    await page.waitForURL(/(?!.*~new)/, { timeout: 30000 });

    console.log('  Waiting for BrokerService to be valid...');
    await waitForCondition(
      'brokerservice',
      yamlServiceName,
      TEST_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    // Verify the resource spec matches the YAML we provided
    console.log('  Verifying resource spec matches YAML input...');
    const resource = getResource('brokerservice', yamlServiceName, TEST_NAMESPACE);
    expect(resource).toBeDefined();

    const metadata = resource.metadata as {
      name: string;
      namespace: string;
      labels?: Record<string, string>;
    };
    expect(metadata.name).toBe(yamlServiceName);
    expect(metadata.namespace).toBe(TEST_NAMESPACE);
    expect(metadata.labels?.env).toBe('test');

    const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
    expect(spec.resources?.limits?.memory).toBe('512Mi');

    console.log(`\n✓ BrokerService ${yamlServiceName} created via YAML with memory=512Mi`);
  });
});

test.describe('BrokerService List Page', () => {
  const LIST_NAMESPACE = 'broker-service-list-e2e';
  const LIST_SERVICE_NAME = 'list-test-broker';

  test.beforeAll(() => {
    createNamespace(LIST_NAMESPACE);
    console.log('\nStarting BrokerService List Page tests\n');
  });

  test.afterAll(() => {
    kubectl(`delete brokerservice --all -n ${LIST_NAMESPACE}`, { ignoreError: true });
    deleteNamespace(LIST_NAMESPACE);
    console.log('\nList page cleanup complete\n');
  });

  test.afterEach(() => {
    kubectl(`delete brokerservice --all -n ${LIST_NAMESPACE}`, { ignoreError: true });
  });

  test('loads custom BrokerService list page', async ({ page }) => {
    await login(page, username, password);
    await gotoBrokerServiceList(page, LIST_NAMESPACE);

    await expect(page.getByText('No BrokerServices found')).toBeVisible();
  });

  test('displays BrokerService created on cluster in list', async ({ page }) => {
    applyYaml(brokerServiceYaml(LIST_SERVICE_NAME, LIST_NAMESPACE, { tier: 'e2e' }));
    await waitForCondition(
      'brokerservice',
      LIST_SERVICE_NAME,
      LIST_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await gotoBrokerServiceList(page, LIST_NAMESPACE);

    await expect(
      page.locator(`[data-test="broker-service-link-${LIST_NAMESPACE}-${LIST_SERVICE_NAME}"]`),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.locator(`[data-test="broker-service-status-${LIST_NAMESPACE}-${LIST_SERVICE_NAME}"]`),
    ).toBeVisible();
  });

  test('navigates to details when name link is clicked', async ({ page }) => {
    applyYaml(brokerServiceYaml(LIST_SERVICE_NAME, LIST_NAMESPACE));
    await waitForCondition(
      'brokerservice',
      LIST_SERVICE_NAME,
      LIST_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await gotoBrokerServiceList(page, LIST_NAMESPACE);

    await page
      .locator(`[data-test="broker-service-link-${LIST_NAMESPACE}-${LIST_SERVICE_NAME}"]`)
      .click();
    await page.waitForURL(
      new RegExp(`/k8s/ns/${LIST_NAMESPACE}/.*${LIST_SERVICE_NAME}(?!.*~new)`),
      { timeout: 30000 },
    );
    await expect(page.locator('h1')).toContainText(LIST_SERVICE_NAME);
  });
});

test.describe('BrokerService Details Page', () => {
  const DETAILS_NAMESPACE = 'broker-service-details-e2e';
  const DETAILS_SERVICE_NAME = 'details-test-broker';

  async function openBrokerServiceDetailsFromList(page: Page) {
    await gotoBrokerServiceList(page, DETAILS_NAMESPACE);
    await page
      .locator(`[data-test="broker-service-link-${DETAILS_NAMESPACE}-${DETAILS_SERVICE_NAME}"]`)
      .click();
    await page.waitForURL(
      new RegExp(`/k8s/ns/${DETAILS_NAMESPACE}/.*${DETAILS_SERVICE_NAME}(?!.*~new)`),
      { timeout: 30000 },
    );
    await expect(page.locator('[data-test="broker-service-details-title"]')).toContainText(
      DETAILS_SERVICE_NAME,
    );
    await expect(page.locator('[data-test="resource-details-favorite-button"]')).toBeVisible();
    await expect(
      page.locator(
        `[data-test="broker-service-details-actions-${DETAILS_NAMESPACE}-${DETAILS_SERVICE_NAME}"]`,
      ),
    ).toBeVisible();
  }

  test.beforeAll(() => {
    createNamespace(DETAILS_NAMESPACE);
    console.log('\nStarting BrokerService Details Page tests\n');
  });

  test.afterAll(() => {
    kubectl(`delete brokerservice --all -n ${DETAILS_NAMESPACE}`, { ignoreError: true });
    deleteNamespace(DETAILS_NAMESPACE);
    console.log('\nDetails page cleanup complete\n');
  });

  test.afterEach(() => {
    kubectl(`delete brokerservice --all -n ${DETAILS_NAMESPACE}`, { ignoreError: true });
  });

  test('navigates from list to Overview and displays labels from cluster', async ({ page }) => {
    applyYaml(
      brokerServiceYaml(DETAILS_SERVICE_NAME, DETAILS_NAMESPACE, {
        tier: 'e2e',
        app: 'messaging',
      }),
    );
    await waitForCondition(
      'brokerservice',
      DETAILS_SERVICE_NAME,
      DETAILS_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await openBrokerServiceDetailsFromList(page);

    await expect(page.locator('[data-test="broker-service-details-breadcrumb"]')).toBeVisible();
    await expect(
      page.locator(
        `[data-test="broker-service-details-status-${DETAILS_NAMESPACE}-${DETAILS_SERVICE_NAME}"]`,
      ),
    ).toBeVisible();
    await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();

    // Labels come from the cluster CR — worth checking once in E2E.
    await expect(page.locator('[data-test="resource-labels-and-annotations"]')).toBeVisible();
    await expect(page.getByText('tier=e2e')).toBeVisible();
    await expect(page.getByText('app=messaging')).toBeVisible();
  });

  test('switches between details tabs', async ({ page }) => {
    applyYaml(brokerServiceYaml(DETAILS_SERVICE_NAME, DETAILS_NAMESPACE));
    await waitForCondition(
      'brokerservice',
      DETAILS_SERVICE_NAME,
      DETAILS_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await openBrokerServiceDetailsFromList(page);

    await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();

    await page.getByRole('tab', { name: 'YAML' }).click();
    await expect(page.locator('[data-test="broker-service-yaml-tab"]')).toBeVisible();

    await page.getByRole('tab', { name: 'Resources' }).click();
    await expect(page.locator('[data-test="broker-service-resources-tab"]')).toBeVisible();

    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.locator('[data-test="broker-service-overview-tab"]')).toBeVisible();
  });
});

test.describe('BrokerService Edit Page', () => {
  const EDIT_NAMESPACE = 'broker-service-edit-e2e';
  const EDIT_SERVICE_NAME = 'edit-test-broker';

  const detailsPath = `/k8s/ns/${EDIT_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerService/${EDIT_SERVICE_NAME}`;
  const editPath = `${detailsPath}/edit?returnUrl=${encodeURIComponent(detailsPath)}`;

  async function openEditPageFromDetailsActions(page: Page) {
    await gotoBrokerServiceList(page, EDIT_NAMESPACE);
    await page
      .locator(`[data-test="broker-service-link-${EDIT_NAMESPACE}-${EDIT_SERVICE_NAME}"]`)
      .click();
    await page.waitForURL(
      new RegExp(`/k8s/ns/${EDIT_NAMESPACE}/.*${EDIT_SERVICE_NAME}(?!.*~new)`),
      {
        timeout: 30000,
      },
    );

    await page
      .locator(
        `[data-test="broker-service-details-actions-${EDIT_NAMESPACE}-${EDIT_SERVICE_NAME}"]`,
      )
      .click();
    await page.getByRole('menuitem', { name: 'Edit BrokerService' }).click();
    await page.waitForURL(new RegExp(`${EDIT_SERVICE_NAME}/edit`), { timeout: 30000 });
    await expect(page.locator('[data-test="edit-brokerservice-title"]')).toBeVisible();
  }

  test.beforeAll(() => {
    createNamespace(EDIT_NAMESPACE);
    console.log('\nStarting BrokerService Edit Page tests\n');
  });

  test.afterAll(() => {
    kubectl(`delete brokerservice --all -n ${EDIT_NAMESPACE}`, { ignoreError: true });
    deleteNamespace(EDIT_NAMESPACE);
    console.log('\nEdit page cleanup complete\n');
  });

  test.afterEach(() => {
    kubectl(`delete brokerservice --all -n ${EDIT_NAMESPACE}`, { ignoreError: true });
  });

  test('navigates to edit from details actions and shows read-only identity fields', async ({
    page,
  }) => {
    applyYaml(brokerServiceYaml(EDIT_SERVICE_NAME, EDIT_NAMESPACE, { tier: 'e2e' }));
    await waitForCondition(
      'brokerservice',
      EDIT_SERVICE_NAME,
      EDIT_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await openEditPageFromDetailsActions(page);

    await expect(page.locator('[data-test="broker-service-name-input"]')).toHaveValue(
      EDIT_SERVICE_NAME,
    );
    await expect(page.locator('[data-test="broker-service-name-input"]')).toBeDisabled();
    await expect(page.locator('[data-test="broker-service-namespace-input"]')).toHaveValue(
      EDIT_NAMESPACE,
    );
    await expect(page.locator('[data-test="broker-service-namespace-input"]')).toBeDisabled();
    await expect(page.locator('[data-test="memory-value-input"]')).toHaveValue('2');
    await expect(page.locator('[data-test="save-broker-service-button"]')).toBeVisible();
    await expect(page.locator('[data-test="reload-broker-service-button"]')).toBeVisible();
    await expect(page.locator('[data-test="cancel-broker-service-button"]')).toBeVisible();
  });

  test('saves memory changes to the cluster and returns to details', async ({ page }) => {
    applyYaml(brokerServiceYaml(EDIT_SERVICE_NAME, EDIT_NAMESPACE));
    await waitForCondition(
      'brokerservice',
      EDIT_SERVICE_NAME,
      EDIT_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await page.goto(editPath, { waitUntil: 'load' });
    await expect(page.locator('[data-test="edit-brokerservice-title"]')).toBeVisible({
      timeout: 30000,
    });

    const memoryInput = page.locator('[data-test="memory-value-input"]');
    await memoryInput.fill('4');
    await page.locator('[data-test="save-broker-service-button"]').click();

    await page.waitForURL(new RegExp(`${EDIT_SERVICE_NAME}(?!.*/edit)`), { timeout: 30000 });

    const resource = getResource('brokerservice', EDIT_SERVICE_NAME, EDIT_NAMESPACE);
    const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
    expect(spec.resources?.limits?.memory).toBe('4Gi');
  });

  test('reload discards unsaved memory edits and restores cluster values', async ({ page }) => {
    applyYaml(brokerServiceYaml(EDIT_SERVICE_NAME, EDIT_NAMESPACE));
    await waitForCondition(
      'brokerservice',
      EDIT_SERVICE_NAME,
      EDIT_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await page.goto(editPath, { waitUntil: 'load' });
    await expect(page.locator('[data-test="edit-brokerservice-title"]')).toBeVisible({
      timeout: 30000,
    });

    const memoryInput = page.locator('[data-test="memory-value-input"]');
    await memoryInput.fill('8');
    await expect(memoryInput).toHaveValue('8');

    await page.locator('[data-test="reload-broker-service-button"]').click();
    await page.locator('[data-test="confirm-reload-btn"]').click();

    await expect(memoryInput).toHaveValue('2', { timeout: 30000 });

    const resource = getResource('brokerservice', EDIT_SERVICE_NAME, EDIT_NAMESPACE);
    const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
    expect(spec.resources?.limits?.memory).toBe('2Gi');
  });

  test('cancel with unsaved changes returns to details via returnUrl', async ({ page }) => {
    applyYaml(brokerServiceYaml(EDIT_SERVICE_NAME, EDIT_NAMESPACE));
    await waitForCondition(
      'brokerservice',
      EDIT_SERVICE_NAME,
      EDIT_NAMESPACE,
      'Valid',
      'True',
      120000,
    );

    await login(page, username, password);
    await page.goto(editPath, { waitUntil: 'load' });
    await expect(page.locator('[data-test="edit-brokerservice-title"]')).toBeVisible({
      timeout: 30000,
    });

    await page.locator('[data-test="memory-value-input"]').fill('6');
    await page.locator('[data-test="cancel-broker-service-button"]').click();
    await page.locator('[data-test="confirm-cancel-btn"]').click();

    await page.waitForURL(new RegExp(`${EDIT_SERVICE_NAME}(?!.*/edit)`), { timeout: 30000 });
    await expect(page.locator('[data-test="broker-service-details-title"]')).toContainText(
      EDIT_SERVICE_NAME,
    );

    const resource = getResource('brokerservice', EDIT_SERVICE_NAME, EDIT_NAMESPACE);
    const spec = resource.spec as { resources?: { limits?: { memory?: string } } };
    expect(spec.resources?.limits?.memory).toBe('2Gi');
  });
});
