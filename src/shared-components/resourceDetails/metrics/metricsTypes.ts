/**
 * The vocabulary of a Metrics section: the charts a feature declares, the
 * queries they run, and the toolbar state they are drawn under.
 */

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

/** How a chart formats its values: binary sizes, CPU cores, or plain counts. */
export type MetricsUnits = 'bytes' | 'cores' | 'count';

/** How one label is matched: a plain string matches it exactly. */
export type LabelMatcher = string | { op: '=' | '!=' | '=~' | '!~'; value: string };

/**
 * Builds a series selector, braces included, pinned to the namespace its query
 * is sent to. It is the only way a query names its namespace, so no query can
 * select the series of another namespace or forget to pin its own.
 */
export type NamespacedSelect = (labels?: Record<string, LabelMatcher>) => string;

/** The labels of one series, with the namespace its query ran in. */
export type SeriesLabels = Partial<Record<string, string>> & { namespace: string };

/** One query a chart runs in one namespace. */
export interface MetricsQuery {
  /** The namespace the query is sent to; the viewer needs read access to its metrics. */
  namespace: string;
  /**
   * The PromQL to run, built around selectors from select, which pins them to
   * the namespace. Any PromQL goes: rate, topk, aggregations.
   */
  query: (select: NamespacedSelect) => string;
  /**
   * Names each series the query returns: a template whose {{label}} parts are
   * replaced by the series' labels, or a function of them; {{namespace}} is the
   * namespace the query ran in. Series given the same name are summed into one.
   * Without it, a series is named after its queue, app or metric, prefixed with
   * its namespace when the chart reads several.
   */
  legend?: string | ((labels: SeriesLabels) => string);
}

/** One chart on a Metrics section. */
export interface MetricsChartSpec {
  /** Unique within the section; names the chart panel's data-test id. */
  id: string;
  title: string;
  /** The filter entry the chart is listed under, already translated. */
  group: string;
  units?: MetricsUnits;
  /** What the chart plots; with none, it shows as unavailable. */
  queries: MetricsQuery[];
}

/** Escapes a label value for a PromQL string literal. */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * The selector builder for queries sent to one namespace. A namespace given in
 * the labels is ignored: the namespace the query is sent to always wins.
 *
 * @param namespace - The namespace the query is sent to
 * @returns A builder of selectors pinned to it, with values escaped
 */
export function namespacedSelect(namespace: string): NamespacedSelect {
  return (labels = {}) => {
    const matchers = Object.entries(labels)
      .filter(([name]) => name !== 'namespace')
      .map(([name, matcher]) => {
        const { op, value } = typeof matcher === 'string' ? { op: '=', value: matcher } : matcher;
        return `${name}${op}"${escapeLabelValue(value)}"`;
      });
    return `{${[`namespace="${escapeLabelValue(namespace)}"`, ...matchers].join(', ')}}`;
  };
}

/**
 * The filter entries of a section: each chart group once, in the order the
 * charts come.
 *
 * @param charts - The section's charts
 */
export function chartGroups(charts: MetricsChartSpec[]): string[] {
  return Array.from(new Set(charts.map(({ group }) => group)));
}

/**
 * The charts the section shows for a filter selection.
 *
 * @param charts - The section's charts
 * @param group - The selected group; null shows them all
 */
export function chartsInGroup(
  charts: MetricsChartSpec[],
  group: string | null,
): MetricsChartSpec[] {
  return group === null ? charts : charts.filter((chart) => chart.group === group);
}

/** Every namespace a section's charts query, each once, sorted. */
export function chartNamespaces(charts: MetricsChartSpec[]): string[] {
  return Array.from(
    new Set(charts.flatMap(({ queries }) => queries.map(({ namespace }) => namespace))),
  ).sort();
}

export interface MetricsToolbarState {
  pollTime: PollTime;
  span: Span;
  /** The group the charts are filtered by; null shows every chart. */
  group: string | null;
  refreshIntervalMs: number | null;
}

export type MetricsToolbarAction =
  | { type: 'CHANGE_REFRESH_INTERVAL'; payload: PollTime }
  | { type: 'CHANGE_TIME_RANGE'; payload: Span }
  | { type: 'FILTER_BY_GROUP'; payload: string | null };

/** Converts a time-range selection to the milliseconds the charts query over. */
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

/** The toolbar a Metrics section opens with: last 30 minutes, every chart, no refresh. */
export function createInitialMetricsToolbarState(): MetricsToolbarState {
  const pollTime: PollTime = '0';
  return {
    pollTime,
    span: '30m',
    group: null,
    refreshIntervalMs: pollTimeToMilliseconds(pollTime),
  };
}

/** Applies Metrics toolbar actions, keeping the refresh interval in step with its selection. */
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
    case 'FILTER_BY_GROUP':
      return {
        ...state,
        group: action.payload,
      };
    default:
      return state;
  }
}
