import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import { MetricsChart, formatMetricValue, toChartSeries, yAxisTicks } from './MetricsChart';
import { MetricsTimeContext } from './metricsTimeContext';
import type { MetricsQuery } from './metricsTypes';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

/** A response of one series per label set, each with the values given. */
const matrix = (...series: [Record<string, string>, [number, string][]][]): PrometheusResponse => ({
  status: 'success',
  data: {
    resultType: 'matrix',
    result: series.map(([metric, values]) => ({ metric, values })),
  },
});

/** A query of `up` in the given namespace. */
const upIn = (namespace: string): MetricsQuery => ({
  namespace,
  query: (select) => `up${select()}`,
});

describe('toChartSeries', () => {
  it('names each series <namespace>/<queue> when several namespaces answered', () => {
    const series = toChartSeries([
      { namespace: 'tenant-a', response: matrix([{ queue: 'ORDERS' }, [[1000, '3']]]) },
      { namespace: 'tenant-b', response: matrix([{ queue: 'b-client.news' }, [[1000, '5']]]) },
    ]);

    expect(series.map(({ name }) => name)).toEqual(['tenant-a/ORDERS', 'tenant-b/b-client.news']);
    expect(series[0].points).toEqual([{ x: new Date(1000 * 1000), y: 3, name: 'tenant-a/ORDERS' }]);
  });

  it('names a series summed per app after the app, alone in its namespace', () => {
    const series = toChartSeries([
      { namespace: 'tenant-a', response: matrix([{ brokerapp: 'app-a' }, []]) },
    ]);
    expect(series.map(({ name }) => name)).toEqual(['app-a']);
  });

  it('names a series without labels after the fallback', () => {
    expect(
      toChartSeries([{ namespace: 'svc', response: matrix([{}, []]) }], 'Memory').map(
        ({ name }) => name,
      ),
    ).toEqual(['Memory']);
  });

  it('names series by a legend template, with the namespace its query ran in', () => {
    const series = toChartSeries([
      {
        namespace: 'team-a',
        legend: '{{namespace}}/{{brokerapp}}/{{ queue }}{{missing}}',
        response: matrix([{ brokerapp: 'app-a', queue: 'ORDERS' }, []]),
      },
    ]);
    expect(series.map(({ name }) => name)).toEqual(['team-a/app-a/ORDERS']);
  });

  it('names series by a legend function of their labels', () => {
    const series = toChartSeries([
      {
        namespace: 'team-b',
        legend: ({ brokerapp, queue }) =>
          brokerapp === 'app-b' ? (queue ?? '') : `other/${queue ?? ''}`,
        response: matrix(
          [{ brokerapp: 'app-b', queue: 'INVOICES' }, []],
          [{ brokerapp: 'app-c', queue: 'PAYMENTS' }, []],
        ),
      },
    ]);
    expect(series.map(({ name }) => name)).toEqual(['INVOICES', 'other/PAYMENTS']);
  });

  it('sums the series given the same name, point by point', () => {
    // one queue, scraped from a broker pod before and after it restarted
    const series = toChartSeries([
      {
        namespace: 'team-b',
        response: matrix(
          [
            { queue: 'INVOICES', instance: '10.0.0.46' },
            [
              [1000, '15'],
              [1060, '20'],
            ],
          ],
          [
            { queue: 'INVOICES', instance: '10.0.0.47' },
            [
              [1060, '1'],
              [1120, '20'],
            ],
          ],
        ),
      },
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].points.map(({ y }) => y)).toEqual([15, 21, 20]);
  });

  it('draws series of different queries apart when named alike, after their namespace', () => {
    const series = toChartSeries([
      {
        namespace: 'team-a',
        legend: '{{queue}}',
        response: matrix([{ queue: 'ORDERS' }, [[1000, '3']]]),
      },
      {
        namespace: 'team-b',
        legend: '{{queue}}',
        response: matrix([{ queue: 'ORDERS' }, [[1000, '5']]]),
      },
      { namespace: 'team-b', legend: '{{queue}}', response: matrix([{ queue: 'INVOICES' }, []]) },
    ]);
    expect(series.map(({ name }) => name)).toEqual([
      'ORDERS (team-a)',
      'ORDERS (team-b)',
      'INVOICES',
    ]);
    expect(series.map(({ points }) => points.map(({ y }) => y))).toEqual([[3], [5], []]);
  });

  it('numbers series of queries in one namespace that are named alike', () => {
    const series = toChartSeries([
      { namespace: 'team-a', legend: 'depth', response: matrix([{ queue: 'ORDERS' }, []]) },
      { namespace: 'team-a', legend: 'depth', response: matrix([{ queue: 'NEWS' }, []]) },
    ]);
    expect(series.map(({ name }) => name)).toEqual(['depth (team-a) #1', 'depth (team-a) #2']);
  });

  it('drops a series labelled with another namespace than its query ran in', () => {
    const series = toChartSeries([
      {
        namespace: 'team-a',
        response: matrix(
          [{ namespace: 'team-a', queue: 'ORDERS' }, []],
          [{ namespace: 'team-b', queue: 'INVOICES' }, []],
        ),
      },
    ]);
    expect(series.map(({ name }) => name)).toEqual(['ORDERS']);
  });

  it('ignores queries without a response yet', () => {
    expect(toChartSeries([{ namespace: 'tenant-a' }])).toEqual([]);
  });
});

describe('formatMetricValue', () => {
  it('formats bytes as binary sizes, cores and counts as plain numbers', () => {
    expect(formatMetricValue(1536, 'bytes')).toBe(
      `${(1.5).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`,
    );
    expect(formatMetricValue(0.0125, 'cores')).toBe(
      (0.0125).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    );
    expect(formatMetricValue(12)).toBe('12');
  });
});

describe('yAxisTicks', () => {
  it('steps from 0 past the largest value by a round step', () => {
    expect(yAxisTicks(2)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(yAxisTicks(51)).toEqual([0, 20, 40, 60]);
    expect(yAxisTicks(0.3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(yAxisTicks(1000)).toEqual([0, 250, 500, 750, 1000]);
  });

  it('is the single tick 0 when nothing rises above it', () => {
    expect(yAxisTicks(0)).toEqual([0]);
  });
});

describe('MetricsChart', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockReset();
    mockUsePrometheusPoll.mockReturnValue([undefined, false, undefined]);
  });

  it('polls each query in its namespace, pinned to it', () => {
    render(
      <MetricsChart
        title="Queue depth"
        queries={[
          upIn('tenant-a'),
          { namespace: 'tenant-b', query: (select) => `q2${select({ brokerapp: 'app-b' })}` },
        ]}
      />,
    );

    const polled = mockUsePrometheusPoll.mock.calls.map(
      ([props]: [{ namespace: string; query: string }]) => `${props.namespace} ${props.query}`,
    );
    expect(new Set(polled)).toEqual(
      new Set([
        'tenant-a up{namespace="tenant-a"}',
        'tenant-b q2{namespace="tenant-b", brokerapp="app-b"}',
      ]),
    );
  });

  it('shows the last 30 minutes without refreshing outside a Metrics section', () => {
    render(<MetricsChart title="Queue depth" queries={[upIn('tenant-a')]} />);
    expect(mockUsePrometheusPoll).toHaveBeenCalledWith(
      expect.objectContaining({ timespan: 30 * 60_000, delay: undefined }),
    );
  });

  it('follows the time range and refresh of the section it is in', () => {
    render(
      <MetricsTimeContext.Provider value={{ timespan: 3_600_000, pollInterval: 15_000 }}>
        <MetricsChart title="Queue depth" queries={[upIn('tenant-a')]} />
      </MetricsTimeContext.Provider>,
    );
    expect(mockUsePrometheusPoll).toHaveBeenCalledWith(
      expect.objectContaining({ timespan: 3_600_000, delay: 15_000 }),
    );
  });

  it('shows as unavailable without queries', () => {
    render(<MetricsChart title="Queue depth" queries={[]} dataTest="chart" />);
    expect(screen.getByTestId('chart')).toHaveTextContent('Data unavailable');
    expect(mockUsePrometheusPoll).not.toHaveBeenCalled();
  });

  it('waits for every query before plotting', () => {
    render(<MetricsChart title="Queue depth" queries={[upIn('tenant-a')]} />);
    expect(screen.getByLabelText('Loading metrics')).toBeInTheDocument();
  });

  it('plots what answered once every query is done, a failed one included', () => {
    mockUsePrometheusPoll.mockImplementation(({ namespace }: { namespace: string }) =>
      namespace === 'tenant-a'
        ? [matrix([{ queue: 'ORDERS' }, [[1000, '3']]]), true, undefined]
        : [undefined, true, new Error('forbidden')],
    );
    render(<MetricsChart title="Queue depth" queries={[upIn('tenant-a'), upIn('tenant-b')]} />);
    expect(screen.queryByLabelText('Loading metrics')).not.toBeInTheDocument();
    expect(screen.queryByText('No datapoints found.')).not.toBeInTheDocument();
  });

  it('says so when no query returned any series', () => {
    mockUsePrometheusPoll.mockReturnValue([matrix(), true, undefined]);
    render(<MetricsChart title="Queue depth" queries={[upIn('tenant-a')]} />);
    expect(screen.getByText('No datapoints found.')).toBeInTheDocument();
  });
});
