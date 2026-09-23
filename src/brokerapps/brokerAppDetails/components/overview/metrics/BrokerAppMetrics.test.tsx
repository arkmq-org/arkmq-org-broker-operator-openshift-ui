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
});
