import type { FC } from 'react';
import { useMemo } from 'react';
import { PrometheusEndpoint, usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import { Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { namespacedSelect } from '../../../shared-components/resourceDetails/metrics/metricsTypes';

/** How often the list re-reads memory so values stay near the detail charts. */
const MEMORY_POLL_INTERVAL_MS = 30_000;

export interface BrokerServiceMemoryCellProps {
  /** BrokerService CR name; also the StatefulSet name prefix for the broker pod. */
  name?: string;
  /** Namespace the broker pod runs in; Prometheus queries are authorized per namespace. */
  namespace?: string;
}

/**
 * Formats raw container memory bytes as Mi/Gi for the BrokerService list column.
 * Uses binary units (1024) to stay comparable with Kubernetes resource quantities.
 *
 * @param bytes - Working-set bytes from Prometheus
 * @returns Human-readable size such as "3.2 Gi" or "512 Mi"
 */
export function formatMemoryMiGi(bytes: number): string {
  const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti'] as const;
  let scaled = bytes;
  let step = 0;
  while (Math.abs(scaled) >= 1024 && step < units.length - 1) {
    scaled /= 1024;
    step += 1;
  }
  const digits = step === 0 ? 0 : 1;
  return `${scaled.toLocaleString(undefined, { maximumFractionDigits: digits })} ${units[step]}`;
}

/**
 * PromQL for the BrokerService broker pod's container working set — same series the
 * detail Memory chart reads, so list and overview stay comparable.
 *
 * @param name - BrokerService name (pod is `<name>-ss-0`)
 * @param namespace - Namespace the query is sent to
 * @returns Instant-vector PromQL, or empty when name/namespace are missing (disables polling)
 */
export function brokerServiceMemoryQuery(name?: string, namespace?: string): string {
  if (!name || !namespace) {
    return '';
  }
  const select = namespacedSelect(namespace);
  return `sum(container_memory_working_set_bytes${select({
    pod: `${name}-ss-0`,
    container: { op: '!=', value: '' },
  })})`;
}

/**
 * Reads the instant sample from a Prometheus vector response.
 * Empty result means no scrape / no running pod for that selector.
 *
 * @param response - Instant query response from usePrometheusPoll
 * @returns Bytes as a number, or undefined when missing/unparseable
 */
export function readInstantBytes(response?: PrometheusResponse): number | undefined {
  const raw = response?.data.result[0]?.value?.[1];
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Memory Usage cell for one BrokerService list row.
 * Polls Prometheus for the broker pod working set; shows a spinner while loading
 * and "N/A" when the service has no pods, metrics are refused, or the query fails.
 */
export const BrokerServiceMemoryCell: FC<BrokerServiceMemoryCellProps> = ({ name, namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const query = useMemo(() => brokerServiceMemoryQuery(name, namespace), [name, namespace]);

  const [response, loaded, error] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY,
    namespace,
    query,
    delay: MEMORY_POLL_INTERVAL_MS,
  });

  const dataTest =
    name && namespace ? `broker-service-memory-${namespace}-${name}` : 'broker-service-memory';

  if (!query) {
    return (
      <span data-test={dataTest} data-test-memory="na">
        {t('N/A')}
      </span>
    );
  }

  if (!loaded) {
    return (
      <Spinner
        size="md"
        aria-label={t('Loading memory')}
        data-test={dataTest}
        data-test-memory="loading"
      />
    );
  }

  const bytes = !error ? readInstantBytes(response) : undefined;
  if (bytes === undefined) {
    return (
      <span data-test={dataTest} data-test-memory="na">
        {t('N/A')}
      </span>
    );
  }

  return (
    <span data-test={dataTest} data-test-memory="value">
      {formatMemoryMiGi(bytes)}
    </span>
  );
};
