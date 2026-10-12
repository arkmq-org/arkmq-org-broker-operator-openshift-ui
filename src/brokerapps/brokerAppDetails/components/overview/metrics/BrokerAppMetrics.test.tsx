import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR } from '../../../../../k8s/types';
import {
  BrokerAppMetrics,
  appQueueQueries,
  appQueueReads,
  consumedAddresses,
} from './BrokerAppMetrics';
import { namespacedSelect } from '../../../../../shared-components/resourceDetails/metrics/metricsTypes';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

/** A BrokerApp in team-b consuming the given addresses. */
const appConsuming = (
  consumerOf: NonNullable<BrokerAppCR['spec']['capabilities']>[number]['consumerOf'],
) =>
  ({
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'app-b', namespace: 'team-b' },
    spec: { capabilities: [{ consumerOf }] },
  }) as BrokerAppCR;

/** A poll, as `<namespace> <query>`. */
const polled = (namespace: string, query: string) => `${namespace} ${query}`;

/** What each poll ran, as `<namespace> <query>`. */
const polledQueries = () =>
  new Set(
    mockUsePrometheusPoll.mock.calls.map(
      ([props]: [{ namespace: string; query: string }]) => `${props.namespace} ${props.query}`,
    ),
  );

describe('BrokerAppMetrics', () => {
  it('renders the Metrics section heading', () => {
    render(<BrokerAppMetrics />);
    expect(screen.getByText('Metrics')).toBeInTheDocument();
  });

  it('renders both chart placeholders when no resource context is given', () => {
    render(<BrokerAppMetrics />);
    expect(screen.getByTestId('broker-app-metric-queue-depth')).toBeInTheDocument();
    expect(screen.getByTestId('broker-app-metric-consumer-count')).toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable')).toHaveLength(2);
  });

  it('plots each queue the app owns, as filed in its namespace', () => {
    mockUsePrometheusPoll.mockClear();
    render(
      <BrokerAppMetrics
        app={{ ...appConsuming([]), metadata: { name: 'my-app', namespace: 'my-ns' } }}
      />,
    );
    expect(screen.getAllByTestId('metrics-chart-plot')).toHaveLength(2);
    expect(screen.queryByText('Data unavailable')).not.toBeInTheDocument();

    expect(polledQueries()).toEqual(
      new Set([
        polled('my-ns', 'broker_queue_message_count{namespace="my-ns", brokerapp="my-app"}'),
        polled('my-ns', 'broker_queue_consumer_count{namespace="my-ns", brokerapp="my-app"}'),
      ]),
    );
  });

  it('also plots the queues it consumes from apps in other namespaces, as filed there', () => {
    mockUsePrometheusPoll.mockClear();
    render(
      <BrokerAppMetrics
        app={appConsuming([
          { address: 'INVOICES' },
          { address: 'ORDERS', appName: 'app-a', appNamespace: 'team-a' },
          { address: 'NEWS', appName: 'app-a', appNamespace: 'team-a', subscriptions: ['b.news'] },
        ])}
      />,
    );
    expect(polledQueries()).toEqual(
      new Set([
        polled('team-b', 'broker_queue_message_count{namespace="team-b", brokerapp="app-b"}'),
        polled(
          'team-a',
          'broker_queue_message_count{namespace="team-a", brokerapp="app-a", address="ORDERS"}',
        ),
        polled('team-b', 'broker_queue_consumer_count{namespace="team-b", brokerapp="app-b"}'),
        polled(
          'team-a',
          'broker_queue_consumer_count{namespace="team-a", brokerapp="app-a", address="ORDERS"}',
        ),
      ]),
    );
  });

  it('reads what an app consumes from its own namespace apart from its own queues', () => {
    mockUsePrometheusPoll.mockClear();
    render(
      <BrokerAppMetrics
        app={appConsuming([{ address: 'ORDERS', appName: 'app-c', appNamespace: 'team-b' }])}
      />,
    );
    expect(polledQueries()).toEqual(
      new Set([
        polled('team-b', 'broker_queue_message_count{namespace="team-b", brokerapp="app-b"}'),
        polled(
          'team-b',
          'broker_queue_message_count{namespace="team-b", brokerapp="app-c", address="ORDERS"}',
        ),
        polled('team-b', 'broker_queue_consumer_count{namespace="team-b", brokerapp="app-b"}'),
        polled(
          'team-b',
          'broker_queue_consumer_count{namespace="team-b", brokerapp="app-c", address="ORDERS"}',
        ),
      ]),
    );
  });
});

describe('consumedAddresses', () => {
  it('lists each address another app owns once, leaving out publish-subscribe ones', () => {
    expect(
      consumedAddresses(
        appConsuming([
          { address: 'INVOICES' },
          { address: 'ORDERS', appName: 'app-a', appNamespace: 'team-a' },
          { address: 'ORDERS', appName: 'app-a', appNamespace: 'team-a' },
          { address: 'NEWS', appName: 'app-a', appNamespace: 'team-a', pubSub: true },
          { address: 'NEWS', appName: 'app-a', appNamespace: 'team-a', subscriptions: ['b.news'] },
          { address: 'SELF', appName: 'app-b', appNamespace: 'team-b' },
        ]),
      ),
    ).toEqual([{ appNamespace: 'team-a', appName: 'app-a', address: 'ORDERS' }]);
  });

  it('is empty without an app', () => {
    expect(consumedAddresses(undefined)).toEqual([]);
  });
});

describe('appQueueReads', () => {
  it('reads its own queues first, then each producer app once, even in its namespace', () => {
    expect(
      appQueueReads('team-b', 'app-b', [
        { appNamespace: 'team-a', appName: 'app-a', address: 'ORDERS' },
        { appNamespace: 'team-b', appName: 'app-c', address: 'PAYMENTS' },
        { appNamespace: 'team-a', appName: 'app-a', address: 'RETURNS' },
      ]),
    ).toEqual([
      { namespace: 'team-b', app: 'app-b' },
      { namespace: 'team-a', app: 'app-a', addresses: ['ORDERS', 'RETURNS'] },
      { namespace: 'team-b', app: 'app-c', addresses: ['PAYMENTS'] },
    ]);
  });
});

describe('appQueueQueries', () => {
  const [own, consumed] = appQueueQueries(
    'team-b',
    'app-b',
    [
      { appNamespace: 'team-a', appName: 'app-a', address: 'ORDERS' },
      { appNamespace: 'team-a', appName: 'app-a', address: 'RETURNS' },
    ],
    (selector) => `broker_queue_message_count${selector}`,
  );
  it('names the app its own queues after themselves', () => {
    expect(own.query(namespacedSelect('team-b'))).toBe(
      'broker_queue_message_count{namespace="team-b", brokerapp="app-b"}',
    );
    expect(own.legend).toBe('{{queue}}');
  });

  it('reads the addresses consumed from an app in one query, sourced as <namespace>/<app>/<queue>', () => {
    expect(consumed.query(namespacedSelect('team-a'))).toBe(
      'broker_queue_message_count{namespace="team-a", brokerapp="app-a", address="ORDERS"}' +
        ' or broker_queue_message_count{namespace="team-a", brokerapp="app-a", address="RETURNS"}',
    );
    expect(consumed.legend).toBe('team-a/app-a/{{queue}}');
  });

  it('runs the PromQL it is given around each selector, a rate as well as a gauge', () => {
    const [ownRate, consumedRate] = appQueueQueries(
      'team-b',
      'app-b',
      [
        { appNamespace: 'team-a', appName: 'app-a', address: 'ORDERS' },
        { appNamespace: 'team-a', appName: 'app-a', address: 'RETURNS' },
      ],
      (selector) => `rate(broker_queue_messages_added${selector}[5m])`,
    );
    expect(ownRate.query(namespacedSelect('team-b'))).toBe(
      'rate(broker_queue_messages_added{namespace="team-b", brokerapp="app-b"}[5m])',
    );
    expect(consumedRate.query(namespacedSelect('team-a'))).toBe(
      'rate(broker_queue_messages_added{namespace="team-a", brokerapp="app-a", address="ORDERS"}[5m])' +
        ' or rate(broker_queue_messages_added{namespace="team-a", brokerapp="app-a", address="RETURNS"}[5m])',
    );
  });
});
