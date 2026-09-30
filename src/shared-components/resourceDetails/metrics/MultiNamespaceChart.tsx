import type { FC } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrometheusEndpoint, usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import {
  Chart,
  ChartAxis,
  ChartGroup,
  ChartLine,
  ChartThemeColor,
  ChartVoronoiContainer,
} from '@patternfly/react-charts/victory';
import { Bullseye, Spinner, getResizeObserver } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

export interface MultiNamespaceChartProps {
  /** Chart title, for screen readers. */
  title: string;
  /** Namespaces each query runs in; the series of all of them share the plot. */
  namespaces: string[];
  queries: string[];
  /** Time range shown, in milliseconds. */
  timespan: number;
  /** Refresh interval in milliseconds; no refresh when undefined. */
  pollInterval?: number;
  /** 'bytes' formats values as binary sizes; anything else as plain numbers. */
  units?: string;
}

/** One plotted line: a series from one namespace. */
export interface ChartSeries {
  name: string;
  points: { x: Date; y: number; name: string }[];
}

/** Values formatted for the axis and tooltips. */
export function formatMetricValue(value: number, units?: string): string {
  if (units !== 'bytes') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  const steps = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let scaled = value;
  let step = 0;
  while (Math.abs(scaled) >= 1024 && step < steps.length - 1) {
    scaled /= 1024;
    step++;
  }
  return `${scaled.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${steps[step]}`;
}

/**
 * Turns the range query responses of each namespace into chart series, named
 * after the queue they measure and the namespace they were read from.
 */
export function toChartSeries(
  responses: { namespace: string; response?: PrometheusResponse }[],
): ChartSeries[] {
  return responses.flatMap(({ namespace, response }) =>
    (response?.data.result ?? []).map((result) => {
      // a queue series is named after its queue, anything else after its metric
      const labels: Partial<Record<string, string>> = result.metric;
      const name = `${labels.queue ?? labels.__name__ ?? ''} (${namespace})`;
      return {
        name,
        points: (result.values ?? []).map(([time, value]) => ({
          x: new Date(time * 1000),
          y: Number(value),
          name,
        })),
      };
    }),
  );
}

interface NamespaceRangeQueryProps {
  queryKey: string;
  namespace: string;
  query: string;
  timespan: number;
  pollInterval?: number;
  onResponse: (queryKey: string, outcome: QueryOutcome) => void;
}

/** Where one namespace's query stands: done once it answered or failed. */
interface QueryOutcome {
  response?: PrometheusResponse;
  done: boolean;
}

/**
 * Polls one query in one namespace. A component per query, rather than a loop of
 * hooks, lets the set of namespaces change between renders.
 */
const NamespaceRangeQuery: FC<NamespaceRangeQueryProps> = ({
  queryKey,
  namespace,
  query,
  timespan,
  pollInterval,
  onResponse,
}) => {
  const [response, loaded, error] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY_RANGE,
    namespace,
    query,
    timespan,
    samples: 60,
    delay: pollInterval,
  });

  useEffect(() => {
    onResponse(queryKey, { response, done: loaded || !!error });
  }, [queryKey, response, loaded, error, onResponse]);

  return null;
};

/**
 * Plots queries run in several namespaces as one chart. Each query goes through
 * the namespace-scoped query endpoint, so a user needs read access to metrics in
 * each namespace, not to the whole cluster.
 */
export const MultiNamespaceChart: FC<MultiNamespaceChartProps> = ({
  title,
  namespaces,
  queries,
  timespan,
  pollInterval,
  units,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [outcomes, setOutcomes] = useState<Partial<Record<string, QueryOutcome>>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }
    const handleResize = () => {
      setWidth(container.clientWidth);
    };
    handleResize();
    return getResizeObserver(container, handleResize);
  }, []);

  const requests = useMemo(
    () =>
      namespaces.flatMap((namespace) =>
        queries.map((query) => ({ queryKey: `${namespace}|${query}`, namespace, query })),
      ),
    [namespaces, queries],
  );

  const onResponse = useCallback((queryKey: string, outcome: QueryOutcome) => {
    setOutcomes((current) => ({ ...current, [queryKey]: outcome }));
  }, []);

  const series = useMemo(
    () =>
      toChartSeries(
        requests.map(({ queryKey, namespace }) => ({
          namespace,
          response: outcomes[queryKey]?.response,
        })),
      ),
    [requests, outcomes],
  );
  const loaded = requests.every(({ queryKey }) => outcomes[queryKey]?.done);

  const legendRows = Math.ceil(series.length / 2);

  return (
    <div ref={containerRef} data-test="multi-namespace-chart">
      {requests.map((request) => (
        <NamespaceRangeQuery
          key={request.queryKey}
          {...request}
          timespan={timespan}
          pollInterval={pollInterval}
          onResponse={onResponse}
        />
      ))}
      {!loaded ? (
        <Bullseye>
          <Spinner size="lg" aria-label={t('Loading metrics')} />
        </Bullseye>
      ) : series.length === 0 ? (
        <Bullseye>{t('No datapoints found.')}</Bullseye>
      ) : width > 0 ? (
        <Chart
          ariaTitle={title}
          containerComponent={
            <ChartVoronoiContainer
              labels={({ datum }: { datum: { name: string; y: number } }) =>
                `${datum.name}: ${formatMetricValue(datum.y, units)}`
              }
              constrainToVisibleArea
            />
          }
          height={200 + legendRows * 20}
          width={width}
          legendData={series.map(({ name }) => ({ name }))}
          legendPosition="bottom-left"
          legendAllowWrap
          padding={{ bottom: 50 + legendRows * 20, left: 70, right: 20, top: 10 }}
          scale={{ x: 'time', y: 'linear' }}
          themeColor={ChartThemeColor.multiOrdered}
        >
          <ChartAxis
            tickCount={5}
            tickFormat={(tick: Date) =>
              tick.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
            }
          />
          <ChartAxis
            dependentAxis
            showGrid
            tickFormat={(tick: number) => formatMetricValue(tick, units)}
          />
          <ChartGroup>
            {series.map(({ name, points }) => (
              <ChartLine key={name} data={points} />
            ))}
          </ChartGroup>
        </Chart>
      ) : null}
    </div>
  );
};
