import {
  MetricsType,
  createInitialMetricsToolbarState,
  filterChartsByMetricsType,
  isMetricsChartVisible,
  metricsToolbarReducer,
  pollTimeToMilliseconds,
  spanToMilliseconds,
} from './metricsTypes';

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
];

describe('createInitialMetricsToolbarState', () => {
  it('starts with refresh off, last 30 minutes, all charts visible, and no polling', () => {
    expect(createInitialMetricsToolbarState(charts)).toEqual({
      pollTime: '0',
      span: '30m',
      metricsType: MetricsType.AllMetrics,
      charts,
      visibleCharts: charts,
      refreshIntervalMs: null,
    });
  });
});

describe('metricsToolbarReducer', () => {
  const initialState = createInitialMetricsToolbarState(charts);

  it('derives refresh interval in milliseconds when refresh changes', () => {
    const next = metricsToolbarReducer(initialState, {
      type: 'CHANGE_REFRESH_INTERVAL',
      payload: '15s',
    });
    expect(next.pollTime).toBe('15s');
    expect(next.refreshIntervalMs).toBe(15_000);
    expect(next.visibleCharts).toEqual(charts);
  });

  it('updates the time range', () => {
    const next = metricsToolbarReducer(initialState, {
      type: 'CHANGE_TIME_RANGE',
      payload: '1h',
    });
    expect(next.span).toBe('1h');
  });

  it('filters visible charts when the metrics type changes', () => {
    const next = metricsToolbarReducer(initialState, {
      type: 'FILTER_BY_METRICS_TYPE',
      payload: MetricsType.CPUUsage,
    });
    expect(next.metricsType).toBe(MetricsType.CPUUsage);
    expect(next.visibleCharts).toEqual([charts[1]]);
  });

  it('returns the same state for an unknown action', () => {
    const next = metricsToolbarReducer(initialState, { type: 'UNKNOWN' } as unknown as {
      type: 'CHANGE_REFRESH_INTERVAL';
      payload: '0';
    });
    expect(next).toBe(initialState);
  });
});

describe('filterChartsByMetricsType', () => {
  it('shows only charts that match the selected filter', () => {
    expect(filterChartsByMetricsType(charts, MetricsType.MemoryUsage)).toEqual([charts[0]]);
  });
});

describe('isMetricsChartVisible', () => {
  it('shows every chart when All Metrics is selected', () => {
    expect(isMetricsChartVisible(MetricsType.MemoryUsage, MetricsType.AllMetrics)).toBe(true);
    expect(isMetricsChartVisible(MetricsType.CPUUsage, MetricsType.AllMetrics)).toBe(true);
    expect(isMetricsChartVisible(MetricsType.BrokerMetrics, MetricsType.AllMetrics)).toBe(true);
  });

  it('shows only charts that match the selected filter', () => {
    expect(isMetricsChartVisible(MetricsType.MemoryUsage, MetricsType.MemoryUsage)).toBe(true);
    expect(isMetricsChartVisible(MetricsType.CPUUsage, MetricsType.MemoryUsage)).toBe(false);
    expect(isMetricsChartVisible(MetricsType.BrokerMetrics, MetricsType.BrokerMetrics)).toBe(true);
  });
});

describe('pollTimeToMilliseconds', () => {
  it('returns null when refresh is off', () => {
    expect(pollTimeToMilliseconds('0')).toBeNull();
  });

  it('converts refresh intervals to milliseconds', () => {
    expect(pollTimeToMilliseconds('15s')).toBe(15_000);
    expect(pollTimeToMilliseconds('1m')).toBe(60_000);
  });
});

describe('spanToMilliseconds', () => {
  it('converts time range selections to milliseconds', () => {
    expect(spanToMilliseconds('5m')).toBe(300_000);
    expect(spanToMilliseconds('1h')).toBe(3_600_000);
    expect(spanToMilliseconds('1d')).toBe(86_400_000);
    expect(spanToMilliseconds('2w')).toBe(2 * 604_800_000);
  });

  it('defaults to 30 minutes for 30m', () => {
    expect(spanToMilliseconds('30m')).toBe(30 * 60_000);
  });
});
