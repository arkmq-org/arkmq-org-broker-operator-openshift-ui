import { render, screen } from '@testing-library/react';
import { BrokerServiceMetrics } from './BrokerServiceMetrics';

describe('BrokerServiceMetrics', () => {
  it('queries the service copy of every queue under the generated job', () => {
    render(<BrokerServiceMetrics namespace="svc-ns" name="my-service" />);
    const queries = screen
      .getAllByTestId('query-browser')
      .flatMap((browser) => JSON.parse(browser.getAttribute('data-queries') ?? '[]') as string[]);
    expect(queries).toContain(
      'broker_queue_persistent_size{job="my-service-metrics", namespace="svc-ns", view="service"}',
    );
    expect(queries).toContain(
      'broker_queue_message_count{job="my-service-metrics", namespace="svc-ns", view="service"}',
    );
  });
});
