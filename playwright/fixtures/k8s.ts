import { execSync, spawn } from 'child_process';

/**
 * Strip ANSI color codes and control characters from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

/**
 * Execute a kubectl command
 */
export function kubectl(
  args: string,
  options: { timeout?: number; ignoreError?: boolean } = {},
): string {
  try {
    const result = execSync(`kubectl ${args}`, {
      encoding: 'utf-8',
      timeout: options.timeout || 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim();
  } catch (error: unknown) {
    if (options.ignoreError) {
      return '';
    }
    const err = error as Error & { stderr?: string };
    throw new Error(`kubectl ${args} failed: ${err.message}\n${err.stderr || ''}`);
  }
}

/**
 * Execute a yarn command
 */
export function yarn(args: string, options: { timeout?: number } = {}): string {
  const result = execSync(`yarn ${args}`, {
    encoding: 'utf-8',
    timeout: options.timeout || 120000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // Strip ANSI color codes and control characters
  let cleaned = stripAnsi(result.trim());

  // Yarn outputs "$ command" on the first line, skip it
  const lines = cleaned.split('\n');
  if (lines.length > 0 && lines[0].startsWith('$')) {
    cleaned = lines.slice(1).join('\n');
  }

  return cleaned.trim();
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a resource to have a specific condition
 */
export async function waitForCondition(
  resourceType: string,
  resourceName: string,
  namespace: string,
  conditionType: string,
  expectedStatus = 'True',
  timeoutMs = 300000,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const conditions = kubectl(
        `get ${resourceType} ${resourceName} -n ${namespace} -o jsonpath='{.status.conditions}'`,
        { ignoreError: true },
      );

      if (conditions) {
        const conditionsArray = JSON.parse(conditions) as Array<{
          type: string;
          status: string;
          reason?: string;
        }>;
        const condition = conditionsArray.find((c) => c.type === conditionType);

        if (condition && condition.status === expectedStatus) {
          console.log(
            `✓ ${resourceType}/${resourceName} condition ${conditionType}=${expectedStatus}`,
          );
          return true;
        }

        // Log current status for debugging
        if (condition) {
          console.log(
            `  ${resourceType}/${resourceName} ${conditionType}: ${condition.status} (${condition.reason})`,
          );
        }
      }
    } catch (error) {
      // Resource might not exist yet, continue waiting
    }

    // Wait 5 seconds before checking again
    await sleep(5000);
  }

  throw new Error(
    `Timeout waiting for ${resourceType}/${resourceName} condition ${conditionType}=${expectedStatus} in namespace ${namespace}`,
  );
}

/**
 * Wait for a pod to be ready
 */
export async function waitForPod(
  podName: string,
  namespace: string,
  timeoutMs = 300000,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = kubectl(`get pod ${podName} -n ${namespace} -o jsonpath='{.status.phase}'`, {
        ignoreError: true,
      });

      if (status === 'Running') {
        // Check if containers are ready
        const ready = kubectl(
          `get pod ${podName} -n ${namespace} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}'`,
          { ignoreError: true },
        );

        if (ready === 'True') {
          console.log(`✓ Pod ${podName} is ready`);
          return true;
        }
      }

      console.log(`  Pod ${podName} status: ${status}`);
    } catch (error) {
      // Pod might not exist yet
    }

    await sleep(5000);
  }

  throw new Error(`Timeout waiting for pod ${podName} in namespace ${namespace}`);
}

/**
 * Create a namespace (idempotent)
 */
export function createNamespace(name: string): void {
  kubectl(`create namespace ${name}`, { ignoreError: true });
  console.log(`✓ Namespace ${name} ready`);
}

/**
 * Delete a namespace
 */
export function deleteNamespace(name: string): void {
  kubectl(`delete namespace ${name} --ignore-not-found=true`, { timeout: 120000 });
  console.log(`✓ Namespace ${name} deleted`);
}

/**
 * Apply YAML from stdin
 */
export function applyYaml(yaml: string): void {
  execSync('kubectl apply -f -', {
    input: yaml,
    encoding: 'utf-8',
    timeout: 60000,
  });
}

/**
 * Get resource as JSON
 */
export function getResource(
  resourceType: string,
  resourceName: string,
  namespace: string,
): Record<string, unknown> {
  const json = kubectl(`get ${resourceType} ${resourceName} -n ${namespace} -o json`);
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Check if a secret exists
 */
export function secretExists(secretName: string, namespace: string): boolean {
  try {
    kubectl(`get secret ${secretName} -n ${namespace}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a Kubernetes Job to complete successfully
 */
export async function waitForJob(
  jobName: string,
  namespace: string,
  timeoutMs = 300000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const conditions = kubectl(
        `get job ${jobName} -n ${namespace} -o jsonpath='{.status.conditions}'`,
        { ignoreError: true },
      );

      if (conditions) {
        const conditionsArray = JSON.parse(conditions) as Array<{ type: string; status: string }>;

        if (conditionsArray.find((c) => c.type === 'Failed' && c.status === 'True')) {
          throw new Error(`Job ${jobName} in namespace ${namespace} failed`);
        }

        if (conditionsArray.find((c) => c.type === 'Complete' && c.status === 'True')) {
          console.log(`✓ Job ${jobName} completed successfully`);
          return;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`Job ${jobName}`)) throw error;
      // JSON parse error or missing resource – continue waiting
    }

    console.log(`  Job ${jobName} still running...`);
    await sleep(5000);
  }

  throw new Error(`Timeout waiting for job ${jobName} in namespace ${namespace}`);
}

/**
 * Port-forward to a pod and return cleanup function
 */
export function startPortForward(
  podName: string,
  namespace: string,
  localPort: number,
  remotePort: number,
): { cleanup: () => void; baseUrl: string } {
  const proc = spawn('kubectl', [
    'port-forward',
    '-n',
    namespace,
    podName,
    `${localPort}:${remotePort}`,
  ]);

  // Give port-forward time to establish
  execSync('sleep 2');

  const cleanup = () => {
    proc.kill();
  };

  return {
    cleanup,
    baseUrl: `http://localhost:${localPort}`,
  };
}

/**
 * Query Prometheus API
 */
export function queryPrometheus(baseUrl: string, query: string): Record<string, unknown> {
  const encodedQuery = encodeURIComponent(query);
  const result = execSync(`curl -s "${baseUrl}/api/v1/query?query=${encodedQuery}"`, {
    encoding: 'utf-8',
    timeout: 30000,
  });
  return JSON.parse(result.trim()) as Record<string, unknown>;
}

/**
 * Get Prometheus targets
 */
export function getPrometheusTargets(baseUrl: string): Record<string, unknown> {
  const result = execSync(`curl -s "${baseUrl}/api/v1/targets"`, {
    encoding: 'utf-8',
    timeout: 30000,
  });
  return JSON.parse(result.trim()) as Record<string, unknown>;
}
