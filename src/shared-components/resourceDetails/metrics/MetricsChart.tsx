import type { ComponentProps, FC, ReactNode } from 'react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PrometheusEndpoint, usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import {
  Chart,
  ChartAxis,
  ChartGroup,
  ChartLegend,
  ChartLegendTooltip,
  ChartLine,
  ChartThemeColor,
  createContainer,
} from '@patternfly/react-charts/victory';
import { Bullseye, Spinner, getResizeObserver } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { MetricsChartPanel, MetricsDataUnavailable } from './MetricsCharts';
import { MetricsTimeContext } from './metricsTimeContext';
import {
  type MetricsQuery,
  type MetricsUnits,
  type SeriesLabels,
  namespacedSelect,
} from './metricsTypes';
import './metrics-chart.css';

export interface MetricsChartProps {
  /** Heads the chart, and names it for screen readers. */
  title: string;
  /** What to plot: each query with the namespace it runs in; all share the plot. */
  queries: MetricsQuery[];
  units?: MetricsUnits;
  /** Test id of the chart panel. */
  dataTest?: string;
}

/** One plotted line. */
export interface ChartSeries {
  name: string;
  points: { x: Date; y: number; name: string }[];
}

/** Values formatted for the axis and tooltips. */
export function formatMetricValue(value: number, units?: MetricsUnits): string {
  if (units === 'cores') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
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

/** One query's response, with what the chart needs to name its series. */
export interface ChartResponse {
  namespace: string;
  legend?: MetricsQuery['legend'];
  response?: PrometheusResponse;
}

/**
 * Names one series: by the query's legend when it has one, else after its
 * queue, app or metric, prefixed with its namespace when the chart reads several,
 * since a name is only unique within its namespace.
 */
function seriesName(
  labels: SeriesLabels,
  legend: MetricsQuery['legend'],
  severalNamespaces: boolean,
  fallbackName: string,
): string {
  if (typeof legend === 'function') {
    return legend(labels);
  }
  if (legend !== undefined) {
    return legend.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, label: string) => labels[label] ?? '');
  }
  const measured = labels.queue ?? labels.brokerapp ?? labels.__name__ ?? fallbackName;
  return severalNamespaces ? `${labels.namespace}/${measured}` : measured;
}

/**
 * Turns the range query responses of a chart into its series. Series of one
 * query given the same name are summed into one, point by point: the broker
 * pod restarting under a new address splits a queue in two series, yet it is
 * one line.
 *
 * Series of different queries are never summed, even when named alike: the
 * name comes from the query's legend and from the data, so a queue name can
 * happen to match another query's series, and summing would draw two measures
 * as one line. They are drawn apart, named after their namespace as well, and
 * numbered if that still does not tell them apart, since each line needs its
 * own name to be found in the legend and tooltip.
 *
 * A series labelled with another namespace than its query was sent to is
 * dropped, so a query that escapes its namespace cannot show another tenant's
 * data under this one.
 *
 * @param responses - Each query's response, with its namespace and legend
 * @param fallbackName - Name of a series with nothing else to name it by
 * @returns One series per query and name, in the order they first appear, each
 * named apart from the others
 */
export function toChartSeries(responses: ChartResponse[], fallbackName = ''): ChartSeries[] {
  const severalNamespaces = new Set(responses.map(({ namespace }) => namespace)).size > 1;
  const merged = new Map<
    string,
    { name: string; namespace: string; values: Map<number, number> }
  >();
  responses.forEach(({ namespace, legend, response }, query) => {
    for (const result of response?.data.result ?? []) {
      const metric: Partial<Record<string, string>> = result.metric;
      if (metric.namespace !== undefined && metric.namespace !== namespace) {
        continue;
      }
      const name = seriesName({ ...metric, namespace }, legend, severalNamespaces, fallbackName);
      // a query's series are summed by name; another query's never join them
      const key = JSON.stringify([query, name]);
      const series = merged.get(key) ?? { name, namespace, values: new Map<number, number>() };
      merged.set(key, series);
      for (const [time, value] of result.values ?? []) {
        series.values.set(time, (series.values.get(time) ?? 0) + Number(value));
      }
    }
  });

  const all = Array.from(merged.values());
  const byNamespace = sharedNames(all.map(({ name }) => name)).map((shared, index) =>
    shared ? `${all[index].name} (${all[index].namespace})` : all[index].name,
  );
  const seen = new Map<string, number>();
  const labels = sharedNames(byNamespace).map((shared, index) => {
    if (!shared) {
      return byNamespace[index];
    }
    const nth = (seen.get(byNamespace[index]) ?? 0) + 1;
    seen.set(byNamespace[index], nth);
    return `${byNamespace[index]} #${String(nth)}`;
  });

  return all.map(({ values }, index) => ({
    name: labels[index],
    points: Array.from(values)
      .sort(([a], [b]) => a - b)
      .map(([time, y]) => ({ x: new Date(time * 1000), y, name: labels[index] })),
  }));
}

/**
 * Which of a list of names another one in the list shares.
 *
 * @param names - Names of the series, in order
 * @returns For each name, whether it appears more than once
 */
function sharedNames(names: string[]): boolean[] {
  const counts = new Map<string, number>();
  names.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  return names.map((name) => (counts.get(name) ?? 0) > 1);
}

/** Follows the pointer along the time axis, as the console's own charts do. */
const CursorVoronoiContainer = createContainer('voronoi', 'cursor');

/**
 * Heads the tooltip with the hovered time. ChartLegendTooltip calls its title
 * with the hovered datum, though its type declares Victory's callback arguments.
 */
const tooltipTitle = ((datum: { x: Date }) =>
  formatTooltipTime(datum.x)) as unknown as ComponentProps<typeof ChartLegendTooltip>['title'];

/** The hovered time, as the tooltip heads it. */
function formatTooltipTime(time: Date): string {
  return time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

/** Approximate width of one tooltip character, in pixels. */
const TOOLTIP_CHAR_WIDTH = 8;

/** Room the tooltip's legend symbol and inner padding take, in pixels. */
const TOOLTIP_CHROME_WIDTH = 40;

/** Height of the plot, in pixels; the legend below it scrolls instead. */
const PLOT_HEIGHT = 220;

/**
 * Height of one legend entry, in pixels: Victory stacks entries a text height
 * plus a symbol spacer apart, about 32px at PatternFly's 14px labels. Shorter,
 * and the legend's SVG clips its last entries instead of its box scrolling.
 */
const LEGEND_ROW_HEIGHT = 32;

/** Room above the first legend entry and below the last, in pixels. */
const LEGEND_MARGIN = 10;

/** About as many intervals as the y-axis is divided in. */
const Y_TICK_INTERVALS = 4;

/** Approximate width of one y-axis label character, in pixels. */
const AXIS_CHAR_WIDTH = 8;

/** Space around the y-axis labels, in pixels. */
const AXIS_LABEL_MARGIN = 20;

/**
 * Ticks of the y-axis, from 0 to a round value at or above the largest one, at
 * a round step: 1, 2, 2.5 or 5 times a power of ten. Computed here rather than
 * left to Victory, so the axis is as wide as the labels it actually shows.
 *
 * @param maxValue - Largest value plotted; 0 gives the single tick 0
 * @returns The tick values, ascending, the last one bounding the axis
 */
export function yAxisTicks(maxValue: number): number[] {
  if (!(maxValue > 0)) {
    return [0];
  }
  const rough = maxValue / Y_TICK_INTERVALS;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = magnitude * ([1, 2, 2.5, 5, 10].find((factor) => factor * magnitude >= rough) ?? 10);
  const count = Math.ceil(maxValue / step - 1e-9);
  // multiplied rather than summed, so a step like 0.1 adds no rounding drift
  return Array.from({ length: count + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

/** One query to run in one namespace, as PromQL. */
interface RangeRequest {
  queryKey: string;
  namespace: string;
  query: string;
  legend?: MetricsQuery['legend'];
}

/** Where one query stands: done once it answered or failed. */
interface RangeResult extends ChartResponse {
  done: boolean;
}

/** What the first link of a chain starts from; one array, so its results stay memoized. */
const NO_RESULTS: RangeResult[] = [];

interface RangeQueryChainProps {
  /** Queries still to poll; the first is polled by this link. */
  requests: RangeRequest[];
  /** What the links above this one collected. */
  collected: RangeResult[];
  timespan: number;
  pollInterval?: number;
  /** Draws the chart once every query has a link. */
  renderResults: (results: RangeResult[]) => ReactNode;
}

/**
 * Polls the first of its requests and passes what it collected down to a link
 * polling the rest. A hook cannot be called once per item of a list whose
 * length changes between renders, but a component per item can, and passing the
 * results down as props keeps them out of any shared state.
 *
 * Each link is keyed by its query, so a namespace added or removed past it
 * leaves its poll running; one added before it restarts the links below.
 *
 * @param requests - Queries still to poll; must not be empty
 * @param collected - Results of the queries polled above this link
 * @param renderResults - Renders every query's result, called by the last link
 */
const RangeQueryChain: FC<RangeQueryChainProps> = ({
  requests,
  collected,
  timespan,
  pollInterval,
  renderResults,
}) => {
  const [request, ...rest] = requests;
  const [response, loaded, error] = usePrometheusPoll({
    endpoint: PrometheusEndpoint.QUERY_RANGE,
    namespace: request.namespace,
    query: request.query,
    timespan,
    samples: 60,
    delay: pollInterval,
  });

  const results = useMemo(
    () => [
      ...collected,
      {
        namespace: request.namespace,
        legend: request.legend,
        response,
        done: loaded || !!error,
      },
    ],
    [collected, request.namespace, request.legend, response, loaded, error],
  );

  return rest.length > 0 ? (
    <RangeQueryChain
      key={rest[0].queryKey}
      requests={rest}
      collected={results}
      timespan={timespan}
      pollInterval={pollInterval}
      renderResults={renderResults}
    />
  ) : (
    <>{renderResults(results)}</>
  );
};

interface MetricsPlotProps {
  title: string;
  results: RangeResult[];
  width: number;
  units?: MetricsUnits;
}

/**
 * Draws the series every query returned, once all of them answered. A query the
 * viewer may not run, in a namespace they cannot read, is left out: what it
 * would add is best effort, beside the series the viewer can read.
 *
 * @param title - Names the plot for screen readers, and a series with no label
 * @param results - Each query's result, in query order
 * @param width - Width of the container, in pixels; nothing is drawn at 0
 */
const MetricsPlot: FC<MetricsPlotProps> = ({ title, results, width, units }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const series = useMemo(() => toChartSeries(results, title), [results, title]);

  if (!results.every(({ done }) => done)) {
    return (
      <Bullseye>
        <Spinner size="lg" aria-label={t('Loading metrics')} />
      </Bullseye>
    );
  }

  if (series.length === 0) {
    return <Bullseye>{t('No datapoints found.')}</Bullseye>;
  }
  if (width === 0) {
    return null;
  }

  // the tooltip pairs each hovered point with its legend entry by childName
  const legendData = series.map(({ name }) => ({ childName: name, name }));
  const maxValue = Math.max(0, ...series.flatMap(({ points }) => points.map(({ y }) => y)));
  const yTicks = yAxisTicks(maxValue);
  // an all-zero plot would otherwise repeat 0 on every tick of a [0, 0] axis
  const yMax = yTicks.length > 1 ? yTicks[yTicks.length - 1] : 1;
  // ChartLegendTooltip sizes itself from its rows alone, so a title longer than
  // them would spill out of the box
  const longestRow = Math.max(
    ...series.map(({ name, points }) =>
      Math.max(0, ...points.map(({ y }) => name.length + formatMetricValue(y, units).length + 2)),
    ),
  );
  const tooltipWidth =
    Math.max(formatTooltipTime(new Date()).length, longestRow) * TOOLTIP_CHAR_WIDTH +
    TOOLTIP_CHROME_WIDTH;
  // the plot starts right after the widest y-axis label, rather than at a margin
  // sized for the longest label possible; 1.5 is wider than the 2 above it
  const leftPadding =
    AXIS_LABEL_MARGIN +
    Math.max(...yTicks.map((tick) => formatMetricValue(tick, units).length)) * AXIS_CHAR_WIDTH;

  // the legend sits outside the plot, so a long one scrolls instead of
  // squeezing the plot or growing the card
  return (
    <>
      <Chart
        ariaTitle={title}
        containerComponent={
          // every series' value at the hovered time, under that time, as in QueryBrowser
          <CursorVoronoiContainer
            cursorDimension="x"
            voronoiDimension="x"
            mouseFollowTooltips
            labels={({ datum }: { datum: { y: number } }) => formatMetricValue(datum.y, units)}
            labelComponent={
              <ChartLegendTooltip
                legendData={legendData}
                themeColor={ChartThemeColor.multiOrdered}
                title={tooltipTitle}
                flyoutWidth={tooltipWidth}
              />
            }
          />
        }
        height={PLOT_HEIGHT}
        width={width}
        padding={{ bottom: 40, left: leftPadding, right: 20, top: 10 }}
        scale={{ x: 'time', y: 'linear' }}
        domain={{ y: [0, yMax] }}
        themeColor={ChartThemeColor.multiOrdered}
      >
        <ChartAxis
          tickCount={5}
          tickFormat={(tick: Date) =>
            tick.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
          }
        />
        <ChartAxis
          dependentAxis
          showGrid
          // Victory hides the tick where the axes cross; QueryBrowser labels 0
          crossAxis={false}
          tickValues={yTicks}
          tickFormat={(tick: number) => formatMetricValue(tick, units)}
        />
        <ChartGroup>
          {series.map(({ name, points }) => (
            <ChartLine key={name} name={name} data={points} />
          ))}
        </ChartGroup>
      </Chart>
      <div className="plugin__arkmq-org-broker-operator-openshift-ui__metrics-chart-legend">
        <ChartLegend
          data={legendData}
          orientation="vertical"
          height={series.length * LEGEND_ROW_HEIGHT + LEGEND_MARGIN}
          width={width}
          // drawn at exactly its height, so its box only scrolls once it is long
          responsive={false}
          themeColor={ChartThemeColor.multiOrdered}
        />
      </div>
    </>
  );
};

/**
 * A metrics chart from its queries: give it what to query in which namespace,
 * and it plots the answers together under the section toolbar's time range.
 * Each query goes through the namespace-scoped query endpoint, so a viewer
 * needs read access to metrics in the namespaces queried, not to the whole
 * cluster; what they cannot read is left out.
 *
 * Inside a MetricsSection, the chart follows its toolbar; on its own, it shows
 * the last 30 minutes. With no query, it shows as unavailable.
 */
export const MetricsChart: FC<MetricsChartProps> = ({ title, queries, units, dataTest }) => {
  const { timespan, pollInterval } = useContext(MetricsTimeContext);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const hasQueries = queries.length > 0;

  // the chart is drawn at the container's width, which only the DOM knows
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
    // the container only exists while there is something to plot
  }, [hasQueries]);

  const requests = useMemo(
    () =>
      queries.map(({ namespace, query, legend }) => {
        const promql = query(namespacedSelect(namespace));
        return { queryKey: `${namespace}|${promql}`, namespace, query: promql, legend };
      }),
    [queries],
  );

  const renderResults = useCallback(
    (results: RangeResult[]) => (
      <MetricsPlot title={title} results={results} width={width} units={units} />
    ),
    [title, width, units],
  );

  return (
    <MetricsChartPanel title={title} dataTest={dataTest}>
      {hasQueries ? (
        <div
          className="plugin__arkmq-org-broker-operator-openshift-ui__metrics-chart"
          data-test="metrics-chart-plot"
        >
          {/* measured inside the frame's padding: the plot and legend fill this width */}
          <div ref={containerRef}>
            <RangeQueryChain
              key={requests[0].queryKey}
              requests={requests}
              collected={NO_RESULTS}
              timespan={timespan}
              pollInterval={pollInterval}
              renderResults={renderResults}
            />
          </div>
        </div>
      ) : (
        <MetricsDataUnavailable />
      )}
    </MetricsChartPanel>
  );
};
