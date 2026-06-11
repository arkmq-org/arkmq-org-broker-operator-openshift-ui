import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';
import {
  kubectl,
  createNamespace,
  deleteNamespace,
  getResource,
  waitForCondition,
} from '../fixtures/k8s';

const username = 'kubeadmin';
const password = process.env.KUBEADMIN_PASSWORD || 'kubeadmin';

const BROKERSERVICE_API = 'broker.arkmq.org/v1beta2';
const TEST_NAMESPACE = 'broker-service-e2e';
const SERVICE_NAME = 'test-broker';

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
