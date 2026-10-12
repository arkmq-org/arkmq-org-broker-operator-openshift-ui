import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { checkAccess, usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { MetricsChartSpec } from './metricsTypes';
import { MetricsLayout } from './MetricsLayout';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;
const mockCheckAccess = checkAccess as jest.Mock;

/** A chart querying `up` in each namespace given; none leaves it unavailable. */
const chart = (id: string, group: string, namespaces: string[] = []): MetricsChartSpec => ({
  id,
  title: id,
  group,
  queries: namespaces.map((namespace) => ({ namespace, query: (select) => `up${select()}` })),
});

const charts = [
  chart('memory-total', 'Memory Usage Metrics'),
  chart('cpu-total', 'CPU Usage Metrics'),
  chart('queue-depth', 'Broker Metrics'),
];

describe('MetricsLayout', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockClear();
    mockCheckAccess.mockReset();
    mockCheckAccess.mockImplementation(() => Promise.resolve({ status: { allowed: true } }));
  });

  it('renders the Metrics title, toolbar, and all chart panels by default', () => {
    render(<MetricsLayout charts={charts} dataTestPrefix="broker-service-metric" />);

    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('metrics-actions')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-memory-total')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-cpu-total')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-metric-queue-depth')).toBeInTheDocument();
    expect(screen.getAllByText('Data unavailable')).toHaveLength(3);
  });

  it('lists the groups of its charts in the filter, and shows the selected one', async () => {
    const user = userEvent.setup();
    render(<MetricsLayout charts={charts} dataTestPrefix="broker-service-metric" />);

    await user.click(screen.getByTestId('metrics-actions-metrics-type'));
    await user.click(screen.getByText('Memory Usage Metrics'));

    expect(screen.getByTestId('broker-service-metric-memory-total')).toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-metric-cpu-total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-metric-queue-depth')).not.toBeInTheDocument();
  });

  it('draws the charts it is given now, not those it was mounted with', () => {
    const { rerender } = render(<MetricsLayout charts={[chart('queue-depth', 'Broker')]} />);
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();

    rerender(<MetricsLayout charts={[chart('queue-depth', 'Broker', ['team-a'])]} />);
    expect(screen.getByTestId('metrics-chart-plot')).toBeInTheDocument();
    expect(mockUsePrometheusPoll).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'team-a', query: 'up{namespace="team-a"}' }),
    );
  });

  it('sets the time range of every chart from its toolbar', async () => {
    const user = userEvent.setup();
    render(<MetricsLayout charts={[chart('queue-depth', 'Broker', ['team-a'])]} />);

    await user.click(screen.getByTestId('metrics-actions-span'));
    await user.click(screen.getByText('last 1 hour'));

    expect(mockUsePrometheusPoll).toHaveBeenLastCalledWith(
      expect.objectContaining({ timespan: 3_600_000 }),
    );
  });

  it('warns above the charts when the viewer may not read some of their namespaces', async () => {
    mockCheckAccess.mockImplementation(({ namespace }: { namespace: string }) =>
      Promise.resolve({ status: { allowed: namespace !== 'team-a' } }),
    );
    render(<MetricsLayout charts={[chart('queue-depth', 'Broker', ['team-b', 'team-a'])]} />);
    expect(await screen.findByTestId('metrics-access-warning')).toHaveTextContent(
      'Contact your administrator to request access.',
    );
  });

  it('does not warn when the viewer may read every namespace', async () => {
    render(<MetricsLayout charts={[chart('queue-depth', 'Broker', ['team-b', 'team-a'])]} />);
    await waitFor(() => {
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('metrics-access-warning')).not.toBeInTheDocument();
  });
});
