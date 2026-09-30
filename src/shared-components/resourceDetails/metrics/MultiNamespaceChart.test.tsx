import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import { MultiNamespaceChart, formatMetricValue, toChartSeries } from './MultiNamespaceChart';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

const matrix = (queue: string, values: [number, string][]): PrometheusResponse => ({
  status: 'success',
  data: { resultType: 'matrix', result: [{ metric: { queue }, values }] },
});

describe('toChartSeries', () => {
  it('names each series after its queue and the namespace it was read from', () => {
    const series = toChartSeries([
      { namespace: 'tenant-a', response: matrix('ORDERS', [[1000, '3']]) },
      { namespace: 'tenant-b', response: matrix('b-client.news', [[1000, '5']]) },
    ]);

    expect(series.map(({ name }) => name)).toEqual([
      'ORDERS (tenant-a)',
      'b-client.news (tenant-b)',
    ]);
    expect(series[0].points).toEqual([
      { x: new Date(1000 * 1000), y: 3, name: 'ORDERS (tenant-a)' },
    ]);
  });

  it('ignores namespaces without a response yet', () => {
    expect(toChartSeries([{ namespace: 'tenant-a' }])).toEqual([]);
  });
});

describe('formatMetricValue', () => {
  it('formats bytes as binary sizes and other values as plain numbers', () => {
    expect(formatMetricValue(1536, 'bytes')).toBe(
      `${(1.5).toLocaleString(undefined, { maximumFractionDigits: 1 })} KiB`,
    );
    expect(formatMetricValue(12)).toBe('12');
  });
});

describe('MultiNamespaceChart', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockReset();
    mockUsePrometheusPoll.mockReturnValue([undefined, false, undefined]);
  });

  it('polls every query in every namespace', () => {
    render(
      <MultiNamespaceChart
        title="Queue depth"
        namespaces={['tenant-a', 'tenant-b']}
        queries={['q1', 'q2']}
        timespan={60_000}
      />,
    );

    const polled = mockUsePrometheusPoll.mock.calls.map(
      ([props]: [{ namespace: string; query: string }]) => `${props.namespace} ${props.query}`,
    );
    expect(new Set(polled)).toEqual(
      new Set(['tenant-a q1', 'tenant-a q2', 'tenant-b q1', 'tenant-b q2']),
    );
  });

  it('waits for every namespace before plotting', () => {
    render(
      <MultiNamespaceChart
        title="Queue depth"
        namespaces={['tenant-a']}
        queries={['q1']}
        timespan={60_000}
      />,
    );
    expect(screen.getByLabelText('Loading metrics')).toBeInTheDocument();
  });

  it('says so when no namespace returned any series', () => {
    mockUsePrometheusPoll.mockReturnValue([
      { status: 'success', data: { resultType: 'matrix', result: [] } },
      true,
      undefined,
    ]);
    render(
      <MultiNamespaceChart
        title="Queue depth"
        namespaces={['tenant-a']}
        queries={['q1']}
        timespan={60_000}
      />,
    );
    expect(screen.getByText('No datapoints found.')).toBeInTheDocument();
  });
});
