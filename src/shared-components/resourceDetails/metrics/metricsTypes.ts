/** Shared Metrics toolbar options, state, and filter helpers for chart panels. */

export enum MetricsType {
  AllMetrics = 'all',
  MemoryUsage = 'memory',
  CPUUsage = 'cpu',
  BrokerMetrics = 'broker',
}

export const pollTimeOptions = [
  '0',
  '15s',
  '30s',
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '6h',
  '1d',
  '2d',
  '1w',
  '2w',
] as const;

export const spanOptions = ['5m', '15m', '30m', '1h', '6h', '12h', '1d', '2d', '1w', '2w'] as const;

export type PollTime = (typeof pollTimeOptions)[number];
export type Span = (typeof spanOptions)[number];

/** One entry in the metrics-type dropdown (label comes from the feature via i18n). */
export interface MetricsFilterOption {
  value: MetricsType;
  label: string;
}

/** One Metrics chart tile supplied by a feature. */
export interface MetricsChartConfig {
  id: string;
  title: string;
  metricsType: MetricsType;
  /** PromQL queries rendered by QueryBrowser. Empty array shows the "data unavailable" state. */
  queries: string[];
  /** Y-axis unit label passed to QueryBrowser (e.g. 'bytes', 'cores'). */
  units?: string;
}

export interface MetricsToolbarState {
  pollTime: PollTime;
  span: Span;
  metricsType: MetricsType;
  charts: MetricsChartConfig[];
  visibleCharts: MetricsChartConfig[];
  refreshIntervalMs: number | null;
}

export type MetricsToolbarAction =
  | { type: 'CHANGE_REFRESH_INTERVAL'; payload: PollTime }
  | { type: 'CHANGE_TIME_RANGE'; payload: Span }
  | { type: 'FILTER_BY_METRICS_TYPE'; payload: MetricsType };

/** True when the chart matches the selected metrics filter (or All Metrics). */
export function isMetricsChartVisible(
  chartMetricsType: MetricsType,
  selectedType: MetricsType,
): boolean {
  return selectedType === MetricsType.AllMetrics || chartMetricsType === selectedType;
}

/** Charts that match the selected filter. Lives in the reducer so the view does not filter during render. */
export function filterChartsByMetricsType(
  charts: MetricsChartConfig[],
  metricsType: MetricsType,
): MetricsChartConfig[] {
  return charts.filter((chart) => isMetricsChartVisible(chart.metricsType, metricsType));
}

/** Converts a time-range selection to milliseconds for QueryBrowser's timespan prop. */
export function spanToMilliseconds(span: Span): number {
  const match = /^(\d+)(s|m|h|d|w)$/.exec(span);
  if (!match) return 30 * 60_000;

  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    case 'd':
      return amount * 86_400_000;
    case 'w':
      return amount * 604_800_000;
    default:
      return 30 * 60_000;
  }
}

/** Converts a refresh selection to milliseconds for Prometheus polling. Refresh Off is null. */
export function pollTimeToMilliseconds(pollTime: PollTime): number | null {
  if (pollTime === '0') {
    return null;
  }

  const match = /^(\d+)(s|m|h|d|w)$/.exec(pollTime);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount * 1000;
    case 'm':
      return amount * 60_000;
    case 'h':
      return amount * 3_600_000;
    case 'd':
      return amount * 86_400_000;
    case 'w':
      return amount * 604_800_000;
    default:
      return null;
  }
}

/** Builds initial Metrics toolbar state for a resource's chart configuration. */
export function createInitialMetricsToolbarState(
  charts: MetricsChartConfig[],
): MetricsToolbarState {
  const metricsType = MetricsType.AllMetrics;
  const pollTime: PollTime = '0';
  const span: Span = '30m';

  return {
    pollTime,
    span,
    metricsType,
    charts,
    visibleCharts: filterChartsByMetricsType(charts, metricsType),
    refreshIntervalMs: pollTimeToMilliseconds(pollTime),
  };
}

/** Applies Metrics toolbar actions and derived chart visibility. */
export function metricsToolbarReducer(
  state: MetricsToolbarState,
  action: MetricsToolbarAction,
): MetricsToolbarState {
  switch (action.type) {
    case 'CHANGE_REFRESH_INTERVAL':
      return {
        ...state,
        pollTime: action.payload,
        refreshIntervalMs: pollTimeToMilliseconds(action.payload),
      };
    case 'CHANGE_TIME_RANGE':
      return {
        ...state,
        span: action.payload,
      };
    case 'FILTER_BY_METRICS_TYPE':
      return {
        ...state,
        metricsType: action.payload,
        visibleCharts: filterChartsByMetricsType(state.charts, action.payload),
      };
    default:
      return state;
  }
}
