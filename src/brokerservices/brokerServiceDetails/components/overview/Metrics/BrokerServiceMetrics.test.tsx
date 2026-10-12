import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerServiceMetrics } from './BrokerServiceMetrics';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

/** What each poll ran, as `<namespace> <query>`. */
const polledQueries = () =>
  mockUsePrometheusPoll.mock.calls.map(
    ([props]: [{ namespace: string; query: string }]) => `${props.namespace} ${props.query}`,
  );

describe('BrokerServiceMetrics', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockClear();
  });

  it('queries the service pods for memory and CPU in the service namespace', () => {
    render(
      <BrokerServiceMetrics namespace="svc-ns" name="my-service" appNamespaces={['tenant-a']} />,
    );
    expect(polledQueries()).toEqual(
      expect.arrayContaining([
        'svc-ns sum(container_memory_working_set_bytes{namespace="svc-ns", pod="my-service-ss-0", container!=""})',
        'svc-ns sum(rate(container_cpu_usage_seconds_total{namespace="svc-ns", pod="my-service-ss-0", container!=""}[5m]))',
      ]),
    );
  });

  it('sums the queues of each app under the generated job, in every app namespace', () => {
    render(
      <BrokerServiceMetrics
        namespace="svc-ns"
        name="my-service"
        appNamespaces={['tenant-a', 'tenant-b']}
      />,
    );
    expect(polledQueries()).toEqual(
      expect.arrayContaining([
        'tenant-a sum by (brokerapp) (broker_queue_persistent_size{namespace="tenant-a", job="my-service-metrics"})',
        'tenant-b sum by (brokerapp) (broker_queue_persistent_size{namespace="tenant-b", job="my-service-metrics"})',
        'tenant-a sum by (brokerapp) (broker_queue_message_count{namespace="tenant-a", job="my-service-metrics"})',
        'tenant-b sum by (brokerapp) (broker_queue_message_count{namespace="tenant-b", job="my-service-metrics"})',
      ]),
    );
  });

  it('pins every selector of every query to the namespace it is sent to', () => {
    render(
      <BrokerServiceMetrics
        namespace="svc-ns"
        name="my-service"
        appNamespaces={['tenant-a', 'tenant-b']}
      />,
    );
    for (const [{ namespace, query }] of mockUsePrometheusPoll.mock.calls as [
      { namespace: string; query: string },
    ][]) {
      for (const selector of query.match(/\{[^}]*\}/g) ?? []) {
        expect(selector.startsWith(`{namespace="${namespace}"`)).toBe(true);
      }
    }
  });

  it('lists its chart groups in the filter', () => {
    render(<BrokerServiceMetrics namespace="svc-ns" name="my-service" appNamespaces={[]} />);
    expect(screen.getByTestId('metrics-actions-metrics-type')).toHaveTextContent('All Metrics');
  });

  it('shows the queue charts as unavailable until an app is bound', () => {
    render(<BrokerServiceMetrics namespace="svc-ns" name="my-service" appNamespaces={[]} />);
    expect(screen.getAllByText('Data unavailable')).toHaveLength(2);
    expect(polledQueries().every((polled) => polled.startsWith('svc-ns '))).toBe(true);
  });
});
