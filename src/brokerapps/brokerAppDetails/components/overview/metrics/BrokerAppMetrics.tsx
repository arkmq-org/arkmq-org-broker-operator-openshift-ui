import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { BrokerAppCR } from '../../../../../k8s/types';
import { MetricsLayout } from '../../../../../shared-components/resourceDetails/metrics/MetricsLayout';
import type {
  MetricsChartSpec,
  MetricsQuery,
} from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

export interface BrokerAppMetricsProps {
  /** The BrokerApp whose queues, owned and consumed, are charted. */
  app?: BrokerAppCR;
}

/** An address another app owns that this app consumes from. */
export interface ConsumedAddress {
  appNamespace: string;
  appName: string;
  address: string;
}

/**
 * Addresses another app owns whose queue this app reads. The broker labels a
 * queue with the app owning it and files it in that app's namespace, so the
 * consumer's own series do not include it. Publish-subscribe addresses are left
 * out: the consumer reads them through its own subscription queues, which are
 * already its own.
 *
 * @param app - The consuming BrokerApp
 * @returns Each consumed address once, with the app and namespace owning it
 */
export function consumedAddresses(app?: BrokerAppCR): ConsumedAddress[] {
  const namespace = app?.metadata?.namespace;
  const name = app?.metadata?.name;
  const seen = new Map<string, ConsumedAddress>();
  for (const capability of app?.spec.capabilities ?? []) {
    for (const match of capability.consumerOf ?? []) {
      const { appNamespace, appName, address } = match;
      if (!appNamespace || !appName || match.pubSub || (match.subscriptions?.length ?? 0) > 0) {
        continue;
      }
      if (appNamespace === namespace && appName === name) {
        continue;
      }
      seen.set(`${appNamespace}/${appName}/${address}`, { appNamespace, appName, address });
    }
  }
  return Array.from(seen.values());
}

/** The queues of one app a BrokerApp reads, in one query. */
export interface QueueRead {
  /** Namespace of the app owning the queues, where the broker files them. */
  namespace: string;
  app: string;
  /** Addresses read; all of the app's queues when absent, as for its own. */
  addresses?: string[];
}

/**
 * Where a BrokerApp's queues are read: its own, then those it consumes from
 * each other app, one read per app, its own first. An app is read apart from
 * the others even in the same namespace, so each read names its series one way
 * and a queue of one app is never summed into a queue of another.
 *
 * @param namespace - The app's namespace
 * @param name - The app's name
 * @param consumed - Addresses the app consumes from other apps
 */
export function appQueueReads(
  namespace: string,
  name: string,
  consumed: ConsumedAddress[],
): QueueRead[] {
  const reads = new Map<string, QueueRead>([
    [JSON.stringify([namespace, name]), { namespace, app: name }],
  ]);
  for (const { appNamespace, appName, address } of consumed) {
    const key = JSON.stringify([appNamespace, appName]);
    const read = reads.get(key) ?? { namespace: appNamespace, app: appName, addresses: [] };
    reads.set(key, { ...read, addresses: [...(read.addresses ?? []), address] });
  }
  return Array.from(reads.values());
}

/**
 * The queries charting one queue metric of a BrokerApp, one per app read. Its
 * own queues are named after themselves; a queue another app owns is sourced as
 * <namespace>/<app>/<queue>, the operator's nomenclature, so it is not taken
 * for one of the app's own.
 *
 * @param namespace - The app's namespace
 * @param name - The app's name
 * @param consumed - Addresses the app consumes from other apps
 * @param perQueue - The PromQL charted, given the selector of the queues it
 * reads, such as `rate(broker_queue_messages_added${selector}[5m])`. It must
 * keep the queue label, which names each series
 */
export function appQueueQueries(
  namespace: string,
  name: string,
  consumed: ConsumedAddress[],
  perQueue: (selector: string) => string,
): MetricsQuery[] {
  return appQueueReads(namespace, name, consumed).map(
    ({ namespace: readNamespace, app, addresses }) =>
      addresses
        ? {
            namespace: readNamespace,
            query: (select) =>
              addresses
                .map((address) => perQueue(select({ brokerapp: app, address })))
                .join(' or '),
            legend: `${readNamespace}/${app}/{{queue}}`,
          }
        : {
            namespace: readNamespace,
            query: (select) => perQueue(select({ brokerapp: app })),
            legend: '{{queue}}',
          },
  );
}

/**
 * The charts of a BrokerApp's queues, owned and consumed.
 *
 * @param namespace - The app's namespace
 * @param name - The app's name
 * @param consumed - Addresses the app consumes from other apps
 */
function useAppCharts(
  namespace?: string,
  name?: string,
  consumed: ConsumedAddress[] = [],
): MetricsChartSpec[] {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const queriesOf = (perQueue: (selector: string) => string): MetricsQuery[] =>
    namespace && name ? appQueueQueries(namespace, name, consumed, perQueue) : [];

  return [
    {
      id: 'queue-depth',
      title: t('Queue Depth'),
      group: t('Broker Metrics'),
      queries: queriesOf((selector) => `broker_queue_message_count${selector}`),
    },
    {
      id: 'consumer-count',
      title: t('Consumer Count'),
      group: t('Broker Metrics'),
      queries: queriesOf((selector) => `broker_queue_consumer_count${selector}`),
    },
  ];
}

/**
 * BrokerApp Overview Metrics: broker-level charts of the queues this app owns
 * and, best effort, of those it consumes from other apps. Reading the latter
 * takes access to their namespaces; a viewer without it sees the app's own
 * queues alone. Infrastructure metrics (memory, CPU) belong to BrokerService,
 * not the app.
 */
export const BrokerAppMetrics: FC<BrokerAppMetricsProps> = ({ app }) => {
  const charts = useAppCharts(
    app?.metadata?.namespace,
    app?.metadata?.name,
    consumedAddresses(app),
  );

  return <MetricsLayout dataTestPrefix="broker-app-metric" charts={charts} />;
};
