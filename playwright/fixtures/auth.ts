import { Page } from '@playwright/test';

export async function login(page: Page, username: string, password: string) {
  // Set up console user settings before navigation
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'console-user-settings',
      '{"console.lastPerspective":"admin","console.perspective.visited.admin":true,"console.perspective.visited.dev":true,"console.guidedTour":{"admin":{"completed":true},"dev":{"completed":true}}}',
    );
  });

  // Navigate to the application
  await page.goto('/');

  // Handle the OAuth redirect
  await page.waitForURL('https://oauth-openshift.apps-crc.testing/**', {
    timeout: 30000,
  });

  // Fill in login credentials
  await page.locator('input#inputUsername').clear();
  await page.locator('input#inputUsername').fill(username);
  await page.locator('input#inputPassword').fill(password);

  // Click login button
  await page.locator('button[type=submit]:has-text("Log in")').click();

  // Wait for redirect back to localhost
  await page.waitForURL('http://localhost:9000/**', { timeout: 30000 });

  // Wait for the console nav to be visible (networkidle never fires because
  // the console keeps open WebSocket/long-poll connections to the API server)
  await page.waitForSelector('nav', { timeout: 60000 });
}
