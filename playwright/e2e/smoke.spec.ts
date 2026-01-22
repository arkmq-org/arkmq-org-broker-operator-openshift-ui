import { test, expect } from '@playwright/test';
import { login } from '../fixtures/auth';

const username = 'kubeadmin';
const password = process.env.KUBEADMIN_PASSWORD || 'kubeadmin';

test.describe('Console login smoke', () => {
  test('logs in and lands on console', async ({ page }) => {
    await login(page, username, password);
    await expect(page).toHaveURL(/localhost/, { timeout: 30000 });
  });
});

test.describe('Navigate to the example page', () => {
  test('Logs in and navigate to the example page', async ({
    page,
  }) => {
    // Login
    await login(page, username, password);

    // Navigate to all-namespaces brokers page
    await page.goto('/example', {
      waitUntil: 'load',
    });
    await page.waitForLoadState('domcontentloaded');

    // Ensure Brokers page loaded - wait for heading
    await expect(
      page.locator('h1, [data-test="resource-title"]', { hasText: /Hello, Plugin!/i }),
    ).toBeVisible({ timeout: 30000 });
  });
});

