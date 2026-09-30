import { useMemo } from 'react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricsLayout } from '../../../../../shared-components/resourceDetails/metrics/MetricsLayout';
import type { MetricsChartConfig } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';
import { MetricsType } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

export interface BrokerServiceMetricsProps {
  /** BrokerService namespace, passed to Prometheus for user workload routing. */
  namespace?: string;
  /** BrokerService CR name, used to build pod selectors and the scrape's job name. */
  name?: string;
  /** Namespaces of the apps bound to the service, where their queues are filed. */
  appNamespaces?: string[];
}

/**
 * Builds the PromQL queries that target a BrokerService's broker pod and the
 * series its operator-generated ServiceMonitor collects, under the job
 * <service>-metrics. Container metrics (memory, CPU) use the pod selector in the
 * service's namespace. Each queue is filed in the namespace of the app owning
 * it, so the queue charts run in every bound app's namespace.
 */
function useServiceCharts(
  t: (key: string) => string,
  namespace?: string,
  name?: string,
): MetricsChartConfig[] {
  return useMemo(() => {
    const containerFilter =
      namespace && name ? `namespace="${namespace}", pod=~"${name}-ss-.*", container!=""` : '';
    const serviceFilter = name ? `job="${name}-metrics"` : '';

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
        acrossAppNamespaces: true,
      },
      {
        id: 'queue-depth-per-app',
        title: t('Queue Depth per App'),
        metricsType: MetricsType.BrokerMetrics,
        queries: serviceFilter ? [`broker_queue_message_count{${serviceFilter}}`] : [],
        acrossAppNamespaces: true,
      },
    ];
  }, [t, namespace, name]);
}

/** BrokerService Overview Metrics: container and broker charts on the shared Metrics layout. */
export const BrokerServiceMetrics: FC<BrokerServiceMetricsProps> = ({
  namespace,
  name,
  appNamespaces,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const charts = useServiceCharts(t, namespace, name);

  return (
    <MetricsLayout
      dataTestPrefix="broker-service-metric"
      namespace={namespace}
      appNamespaces={appNamespaces}
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
