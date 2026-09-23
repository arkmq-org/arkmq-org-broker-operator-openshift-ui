import { useMemo } from 'react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricsLayout } from '../../../../../shared-components/resourceDetails/metrics/MetricsLayout';
import type { MetricsChartConfig } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';
import { MetricsType } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

export interface BrokerServiceMetricsProps {
  /** BrokerService namespace, passed to Prometheus for user workload routing. */
  namespace?: string;
  /** BrokerService CR name, used to build pod selectors and series label filters. */
  name?: string;
}

/**
 * Builds the PromQL queries that target a BrokerService's broker pod and the
 * series the operator's ScrapeConfig collects under the service's prometheus
 * identity. Container metrics (memory, CPU) use the pod selector; broker
 * metrics use the brokerservice series label that the ScrapeConfig adds.
 */
function useServiceCharts(
  t: (key: string) => string,
  namespace?: string,
  name?: string,
): MetricsChartConfig[] {
  return useMemo(() => {
    const containerFilter =
      namespace && name ? `namespace="${namespace}", pod=~"${name}-ss-.*", container!=""` : '';
    const serviceFilter =
      namespace && name ? `brokerservice="${name}", brokerservice_namespace="${namespace}"` : '';

    return [
      {
        id: 'memory-total',
        title: t('Memory Usage (Total)'),
        metricsType: MetricsType.MemoryUsage,
        queries: containerFilter
          ? [`sum(container_memory_working_set_bytes{${containerFilter}})`]
          : [],
        units: 'bytes',
      },
      {
        id: 'cpu-total',
        title: t('CPU Usage (Total)'),
        metricsType: MetricsType.CPUUsage,
        queries: containerFilter
          ? [`sum(rate(container_cpu_usage_seconds_total{${containerFilter}}[5m]))`]
          : [],
        units: 'cores',
      },
      {
        id: 'persistent-size-per-queue',
        title: t('Persistent Size per Queue'),
        metricsType: MetricsType.BrokerMetrics,
        queries: serviceFilter ? [`broker_queue_persistent_size{${serviceFilter}}`] : [],
        units: 'bytes',
      },
      {
        id: 'queue-depth-per-app',
        title: t('Queue Depth per App'),
        metricsType: MetricsType.BrokerMetrics,
        queries: serviceFilter ? [`broker_queue_message_count{${serviceFilter}}`] : [],
      },
    ];
  }, [t, namespace, name]);
}

/** BrokerService Overview Metrics: container and broker charts on the shared Metrics layout. */
export const BrokerServiceMetrics: FC<BrokerServiceMetricsProps> = ({ namespace, name }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const charts = useServiceCharts(t, namespace, name);

  return (
    <MetricsLayout
      dataTestPrefix="broker-service-metric"
      namespace={namespace}
      metricsFilterOptions={[
        { value: MetricsType.AllMetrics, label: t('All Metrics') },
        { value: MetricsType.MemoryUsage, label: t('Memory Usage Metrics') },
        { value: MetricsType.CPUUsage, label: t('CPU Usage Metrics') },
        { value: MetricsType.BrokerMetrics, label: t('Broker Metrics') },
      ]}
      charts={charts}
    />
  );
};
