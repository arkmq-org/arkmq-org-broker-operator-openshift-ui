import { render, screen } from '@testing-library/react';
import { BrokerAppMetrics } from './BrokerAppMetrics';

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

  it('renders QueryBrowser when namespace and name are provided', () => {
    render(<BrokerAppMetrics namespace="my-ns" name="my-app" />);
    const browsers = screen.getAllByTestId('query-browser');
    expect(browsers).toHaveLength(2);
    expect(screen.queryByText('Data unavailable')).not.toBeInTheDocument();
  });

  it('queries the queues the app owns, as filed in its namespace', () => {
    render(<BrokerAppMetrics namespace="my-ns" name="my-app" />);
    const queries = screen
      .getAllByTestId('query-browser')
      .flatMap((browser) => JSON.parse(browser.getAttribute('data-queries') ?? '[]') as string[]);
    expect(queries).toEqual([
      'broker_queue_message_count{namespace="my-ns", brokerapp="my-app", view="owner"}',
      'broker_queue_consumer_count{namespace="my-ns", brokerapp="my-app", view="owner"}',
    ]);
  });
});
