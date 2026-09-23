import { useMemo } from 'react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { MetricsLayout } from '../../../../../shared-components/resourceDetails/metrics/MetricsLayout';
import type { MetricsChartConfig } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';
import { MetricsType } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

export interface BrokerAppMetricsProps {
  /** BrokerApp namespace, passed to Prometheus for user workload routing. */
  namespace?: string;
  /** BrokerApp CR name, used as the brokerapp series label filter. */
  name?: string;
}

/**
 * Builds the PromQL queries that target a BrokerApp's own queues.
 * The app is scraped under its own certificate, so the broker exposes only
 * this app's queues. The brokerapp series label comes from the ScrapeConfig.
 */
function useAppCharts(
  t: (key: string) => string,
  namespace?: string,
  name?: string,
): MetricsChartConfig[] {
  return useMemo(() => {
    const appFilter =
      namespace && name ? `brokerapp="${name}", brokerapp_namespace="${namespace}"` : '';

    return [
      {
        id: 'queue-depth',
        title: t('Queue Depth'),
        metricsType: MetricsType.BrokerMetrics,
        queries: appFilter ? [`broker_queue_message_count{${appFilter}}`] : [],
      },
      {
        id: 'consumer-count',
        title: t('Consumer Count'),
        metricsType: MetricsType.BrokerMetrics,
        queries: appFilter ? [`broker_queue_consumer_count{${appFilter}}`] : [],
      },
    ];
  }, [t, namespace, name]);
}

/**
 * BrokerApp Overview Metrics: broker-level charts scoped to this app's queues.
 * Infrastructure metrics (memory, CPU) belong to BrokerService, not the app.
 */
export const BrokerAppMetrics: FC<BrokerAppMetricsProps> = ({ namespace, name }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const charts = useAppCharts(t, namespace, name);

  return (
    <MetricsLayout
      dataTestPrefix="broker-app-metric"
      namespace={namespace}
      metricsFilterOptions={[
        { value: MetricsType.AllMetrics, label: t('All Metrics') },
        { value: MetricsType.BrokerMetrics, label: t('Broker Metrics') },
      ]}
      charts={charts}
    />
  );
};
