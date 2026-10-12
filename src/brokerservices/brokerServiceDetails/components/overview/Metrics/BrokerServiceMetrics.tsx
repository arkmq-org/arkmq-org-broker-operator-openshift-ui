import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricsLayout } from '../../../../../shared-components/resourceDetails/metrics/MetricsLayout';
import type {
  MetricsChartSpec,
  MetricsQuery,
  NamespacedSelect,
} from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

export interface BrokerServiceMetricsProps {
  /** BrokerService namespace, where its broker pod runs. */
  namespace?: string;
  /** BrokerService CR name, naming its broker pod and the scrape's job. */
  name?: string;
  /** Namespaces of the apps bound to the service, where their queues are filed. */
  appNamespaces?: string[];
}

/**
 * The charts of a BrokerService: its broker pod's memory and CPU, read in the
 * service's namespace, and its queues summed per app. Each queue is filed in
 * the namespace of the app owning it, under the job <service>-metrics of the
 * operator-generated ServiceMonitor, so the queue charts read every bound app's
 * namespace; summed per app, since a service's apps are few, its queues many.
 */
function useServiceCharts(
  namespace?: string,
  name?: string,
  appNamespaces: string[] = [],
): MetricsChartSpec[] {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  // a service runs one broker, the only pod of its StatefulSet; the series
  // without a container sum the pod's containers, and would count them twice
  const brokerPod = (select: NamespacedSelect) =>
    select({ pod: `${name ?? ''}-ss-0`, container: { op: '!=', value: '' } });
  const inServiceNamespace = (query: MetricsQuery['query']): MetricsQuery[] =>
    namespace && name ? [{ namespace, query }] : [];
  const inAppNamespaces = (query: MetricsQuery['query']): MetricsQuery[] =>
    name ? appNamespaces.map((appNamespace) => ({ namespace: appNamespace, query })) : [];
  const job = `${name ?? ''}-metrics`;

  return [
    {
      id: 'memory-total',
      title: t('Memory Usage (Total)'),
      group: t('Memory Usage Metrics'),
      units: 'bytes',
      queries: inServiceNamespace(
        (select) => `sum(container_memory_working_set_bytes${brokerPod(select)})`,
      ),
    },
    {
      id: 'cpu-total',
      title: t('CPU Usage (Total)'),
      group: t('CPU Usage Metrics'),
      units: 'cores',
      queries: inServiceNamespace(
        (select) => `sum(rate(container_cpu_usage_seconds_total${brokerPod(select)}[5m]))`,
      ),
    },
    {
      id: 'persistent-size-per-app',
      title: t('Persistent Size per App'),
      group: t('Broker Metrics'),
      units: 'bytes',
      queries: inAppNamespaces(
        (select) => `sum by (brokerapp) (broker_queue_persistent_size${select({ job })})`,
      ),
    },
    {
      id: 'queue-depth-per-app',
      title: t('Queue Depth per App'),
      group: t('Broker Metrics'),
      queries: inAppNamespaces(
        (select) => `sum by (brokerapp) (broker_queue_message_count${select({ job })})`,
      ),
    },
  ];
}

/** BrokerService Overview Metrics: container and broker charts on the shared Metrics layout. */
export const BrokerServiceMetrics: FC<BrokerServiceMetricsProps> = ({
  namespace,
  name,
  appNamespaces,
}) => {
  const charts = useServiceCharts(namespace, name, appNamespaces);
  return <MetricsLayout dataTestPrefix="broker-service-metric" charts={charts} />;
};
