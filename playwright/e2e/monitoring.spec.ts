import { test, expect } from '@playwright/test';
import { kubectl, yarn } from '../fixtures/k8s';

// Minimal smoke test to verify monitoring infrastructure can be enabled.
// This serves as scaffolding for future tests of plugin monitoring features.
// Set TEST_MONITORING=true to run these tests, otherwise they're skipped.
const shouldTestMonitoring = process.env.TEST_MONITORING === 'true';

test.describe('User Workload Monitoring - Infrastructure Smoke Test', () => {
  test.skip(
    !shouldTestMonitoring,
    'Skipping monitoring tests. Set TEST_MONITORING=true to enable.',
  );

  test('enable monitoring → verify pods → cleanup', async () => {
    // 1. Enable user workload monitoring
    yarn('prometheus-config enable');
    console.log('✓ Enabled user workload monitoring');

    // 2. Verify monitoring pods are ready
    yarn('prometheus-config verify');
    console.log('✓ Monitoring verified and ready');

    // 3. Verify ServiceMonitor CRD is available (needed for plugin metrics)
    const crd = kubectl(`get crd servicemonitors.monitoring.coreos.com`, { ignoreError: true });
    expect(crd).toContain('servicemonitors.monitoring.coreos.com');
    console.log('✓ ServiceMonitor CRD available');

    // 4. Cleanup - disable monitoring
    yarn('prometheus-config disable');
    console.log('✓ Monitoring disabled');
  });
});
