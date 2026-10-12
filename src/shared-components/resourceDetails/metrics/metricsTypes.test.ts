import {
  type MetricsChartSpec,
  chartGroups,
  chartNamespaces,
  chartsInGroup,
  createInitialMetricsToolbarState,
  metricsToolbarReducer,
  namespacedSelect,
  pollTimeToMilliseconds,
  spanToMilliseconds,
} from './metricsTypes';

const chart = (id: string, group: string, namespaces: string[] = []): MetricsChartSpec => ({
  id,
  title: id,
  group,
  queries: namespaces.map((namespace) => ({ namespace, query: (select) => `up${select()}` })),
});

const charts = [
  chart('memory', 'Memory', ['svc']),
  chart('depth', 'Broker', ['team-b', 'team-a']),
  chart('consumers', 'Broker', ['team-a']),
];

describe('namespacedSelect', () => {
  it('pins the selector to its namespace, first', () => {
    expect(namespacedSelect('team-a')({ brokerapp: 'app-a', address: 'ORDERS' })).toBe(
      '{namespace="team-a", brokerapp="app-a", address="ORDERS"}',
    );
  });

  it('selects the namespace alone without labels', () => {
    expect(namespacedSelect('team-a')()).toBe('{namespace="team-a"}');
  });

  it('keeps its namespace over one given in the labels', () => {
    expect(namespacedSelect('team-a')({ namespace: 'team-b' })).toBe('{namespace="team-a"}');
  });

  it('matches with the operator given', () => {
    expect(
      namespacedSelect('svc')({
        pod: { op: '=~', value: 'messaging-ss-.*' },
        container: { op: '!=', value: '' },
      }),
    ).toBe('{namespace="svc", pod=~"messaging-ss-.*", container!=""}');
  });

  it('escapes values so they cannot end their string', () => {
    expect(namespacedSelect('team-a')({ address: 'a"b\\c' })).toBe(
      '{namespace="team-a", address="a\\"b\\\\c"}',
    );
  });
});

describe('chartGroups', () => {
  it('lists each group once, in chart order', () => {
    expect(chartGroups(charts)).toEqual(['Memory', 'Broker']);
  });
});

describe('chartsInGroup', () => {
  it('shows every chart without a group selected', () => {
    expect(chartsInGroup(charts, null)).toBe(charts);
  });

  it('shows the charts of the selected group', () => {
    expect(chartsInGroup(charts, 'Broker').map(({ id }) => id)).toEqual(['depth', 'consumers']);
  });
});

describe('chartNamespaces', () => {
  it('lists each namespace queried once, sorted', () => {
    expect(chartNamespaces(charts)).toEqual(['svc', 'team-a', 'team-b']);
  });
});

describe('createInitialMetricsToolbarState', () => {
  it('starts with refresh off, last 30 minutes, every chart shown, and no polling', () => {
    expect(createInitialMetricsToolbarState()).toEqual({
      pollTime: '0',
      span: '30m',
      group: null,
      refreshIntervalMs: null,
    });
  });
});

describe('metricsToolbarReducer', () => {
  const state = createInitialMetricsToolbarState();

  it('derives refresh interval in milliseconds when refresh changes', () => {
    expect(
      metricsToolbarReducer(state, { type: 'CHANGE_REFRESH_INTERVAL', payload: '30s' }),
    ).toMatchObject({ pollTime: '30s', refreshIntervalMs: 30_000 });
  });

  it('updates the time range', () => {
    expect(
      metricsToolbarReducer(state, { type: 'CHANGE_TIME_RANGE', payload: '1h' }),
    ).toMatchObject({ span: '1h' });
  });

  it('filters by group, and back to every chart', () => {
    const filtered = metricsToolbarReducer(state, { type: 'FILTER_BY_GROUP', payload: 'Broker' });
    expect(filtered.group).toBe('Broker');
    expect(metricsToolbarReducer(filtered, { type: 'FILTER_BY_GROUP', payload: null }).group).toBe(
      null,
    );
  });

  it('returns the same state for an unknown action', () => {
    expect(metricsToolbarReducer(state, { type: 'UNKNOWN' } as never)).toBe(state);
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
