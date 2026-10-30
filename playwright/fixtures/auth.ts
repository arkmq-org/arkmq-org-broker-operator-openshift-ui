import { Page } from '@playwright/test';

export async function login(page: Page, username?: string, password?: string) {
  const user = process.env.KUBEADMIN_USERNAME || username || 'kubeadmin';
  const pass = process.env.KUBEADMIN_PASSWORD || password || 'kubeadmin';

  // Set up console user settings before navigation
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'console-user-settings',
      '{"console.lastPerspective":"admin","console.perspective.visited.admin":true,"console.perspective.visited.dev":true,"console.guidedTour":{"admin":{"completed":true},"dev":{"completed":true}}}',
    );
  });

  // Navigate to the application and follow the redirect to OAuth. The console or OAuth
  // route can be briefly unreachable (Chrome ends up on chrome-error://, usually after the
  // console's client-side redirect), so retry the whole navigation a few times.
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    await page.goto('/').catch(() => {
      // net::ERR_* on a transient failure; handled by the chrome-error check below
    });

    // If already logged in, no need to perform OAuth flow
    try {
      await page.waitForURL(
        (url) => url.toString().includes('oauth-openshift') || url.pathname.includes('/k8s/'),
        { timeout: 10000 },
      );
      if (!page.url().includes('oauth-openshift')) {
        console.log('✓ Already authenticated on console');
        return;
      }
    } catch {
      // Continue with OAuth
    }

    // Handle the OAuth redirect
    try {
      await page.waitForURL(/oauth-openshift|oauth\/authorize/i, {
        timeout: 30000,
      });
      break;
    } catch (error) {
      if (attempt >= maxAttempts || !page.url().startsWith('chrome-error://')) {
        throw error;
      }
      console.log(`Console/OAuth not reachable (attempt ${attempt}/${maxAttempts}), retrying`);
      await page.waitForTimeout(5000);
    }
  }

  // If on IDP selection page (multiple IDPs on OpenShift), pick kube:admin for kubeadmin, any other IDP otherwise
  const isKubeAdmin = user === 'kubeadmin' || user === 'kube:admin';
  const idpSelector = page
    .locator(
      isKubeAdmin
        ? 'a[title="Log in with kube:admin"]'
        : 'a[title^="Log in with"]:not([title="Log in with kube:admin"])',
    )
    .first();
  if (await idpSelector.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log(`Clicking IDP selection link: ${await idpSelector.textContent()}`);
    await idpSelector.click();
  }

  // Fill in login credentials
  await page.locator('input#inputUsername').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input#inputUsername').clear();
  await page.locator('input#inputUsername').fill(user);
  await page.locator('input#inputPassword').fill(pass);

  // Click login button
  await page.locator('button[type=submit]:has-text("Log in"), button[type=submit]').click();

  // Wait for redirect back to localhost
  await page.waitForURL('http://localhost:9000/**', { timeout: 45000 });

  // Wait for the page to be fully loaded and interactive
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {
    // networkidle may never be reached while the console keeps polling; domcontentloaded is enough
  });
}
