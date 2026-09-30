import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricsType } from './metricsTypes';
import { MetricsLayout } from './MetricsLayout';

const filterOptions = [
  { value: MetricsType.AllMetrics, label: 'All Metrics' },
  { value: MetricsType.MemoryUsage, label: 'Memory Usage Metrics' },
  { value: MetricsType.CPUUsage, label: 'CPU Usage Metrics' },
  { value: MetricsType.BrokerMetrics, label: 'Broker Metrics' },
];

const charts = [
  {
    id: 'memory-total',
    title: 'Memory Usage (Total)',
    metricsType: MetricsType.MemoryUsage,
    queries: ['sum(container_memory_working_set_bytes{namespace="default"})'],
    units: 'bytes',
  },
  {
    id: 'cpu-total',
    title: 'CPU Usage (Total)',
    metricsType: MetricsType.CPUUsage,
    queries: ['sum(rate(container_cpu_usage_seconds_total{namespace="default"}[5m]))'],
    units: 'cores',
  },
  {
    id: 'queue-depth',
    title: 'Queue Depth per App',
    metricsType: MetricsType.BrokerMetrics,
    queries: ['broker_queue_message_count{job="my-service-metrics"}'],
  },
];

const chartsWithoutQueries = charts.map((c) => ({ ...c, queries: [] }));

describe('MetricsLayout', () => {
  it('renders the Metrics title, toolbar, and all chart panels by default', () => {
    render(
      <MetricsLayout
        charts={chartsWithoutQueries}
        metricsFilterOptions={filterOptions}
        dataTestPrefix="broker-service-metric"
      />,
    );

    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('metrics-actions')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-memory-total')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-cpu-total')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-queue-depth')).toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable').length).toBe(3);
  });

  it('filters chart panels when a metrics type is selected', async () => {
    const user = userEvent.setup();
    render(
      <MetricsLayout
        charts={chartsWithoutQueries}
        metricsFilterOptions={filterOptions}
        dataTestPrefix="broker-service-metric"
      />,
    );

    await user.click(screen.getByTestId('metrics-actions-metrics-type'));
    await user.click(screen.getByText('Memory Usage Metrics'));

    expect(screen.getByTestId('broker-service-metric-memory-total')).toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-metric-cpu-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-metric-queue-depth')).not.toBeInTheDocument();
  });

  it('renders QueryBrowser when namespace and queries are provided', () => {
    render(
      <MetricsLayout
        charts={charts}
        metricsFilterOptions={filterOptions}
        namespace="default"
        dataTestPrefix="broker-service-metric"
      />,
    );

    const browsers = screen.getAllByTestId('query-browser');
    expect(browsers).toHaveLength(3);
    expect(screen.queryByText('Data unavailable')).not.toBeInTheDocument();
  });

  it('falls back to MetricsDataUnavailable when namespace is missing', () => {
    render(
      <MetricsLayout
        charts={charts}
        metricsFilterOptions={filterOptions}
        dataTestPrefix="broker-service-metric"
      />,
    );

    expect(screen.queryByTestId('query-browser')).not.toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable')).toHaveLength(3);
  });
});
