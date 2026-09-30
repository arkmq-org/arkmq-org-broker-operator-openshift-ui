import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerServiceMetrics } from './BrokerServiceMetrics';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

describe('BrokerServiceMetrics', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockClear();
  });

  it('queries the service pods for memory and CPU in the service namespace', () => {
    render(
      <BrokerServiceMetrics namespace="svc-ns" name="my-service" appNamespaces={['tenant-a']} />,
    );
    const queries = screen
      .getAllByTestId('query-browser')
      .flatMap((browser) => JSON.parse(browser.getAttribute('data-queries') ?? '[]') as string[]);
    expect(queries).toEqual([
      'sum(container_memory_working_set_bytes{namespace="svc-ns", pod=~"my-service-ss-.*", container!=""})',
      'sum(rate(container_cpu_usage_seconds_total{namespace="svc-ns", pod=~"my-service-ss-.*", container!=""}[5m]))',
    ]);
  });

  it('queries the queues under the generated job in every app namespace', () => {
    render(
      <BrokerServiceMetrics
        namespace="svc-ns"
        name="my-service"
        appNamespaces={['tenant-a', 'tenant-b']}
      />,
    );
    const polled = mockUsePrometheusPoll.mock.calls.map(
      ([props]: [{ namespace: string; query: string }]) => `${props.namespace} ${props.query}`,
    );
    expect(polled).toEqual(
      expect.arrayContaining([
        'tenant-a broker_queue_persistent_size{job="my-service-metrics"}',
        'tenant-b broker_queue_persistent_size{job="my-service-metrics"}',
        'tenant-a broker_queue_message_count{job="my-service-metrics"}',
        'tenant-b broker_queue_message_count{job="my-service-metrics"}',
      ]),
    );
  });

  it('shows the queue charts as unavailable until an app is bound', () => {
    render(<BrokerServiceMetrics namespace="svc-ns" name="my-service" appNamespaces={[]} />);
    expect(screen.getAllByText('Data unavailable')).toHaveLength(2);
    expect(mockUsePrometheusPoll).not.toHaveBeenCalled();
  });
});
