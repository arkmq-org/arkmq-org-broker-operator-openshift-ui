import type { FC } from 'react';
import { useReducer } from 'react';
import { GalleryItem } from '@patternfly/react-core';
import { QueryBrowser } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { MetricsActions } from './MetricsActions';
import { MetricsChartGrid, MetricsChartPanel, MetricsDataUnavailable } from './MetricsCharts';
import { MetricsSection } from './MetricsSection';
import { MultiNamespaceChart } from './MultiNamespaceChart';
import {
  type MetricsChartConfig,
  type MetricsFilterOption,
  createInitialMetricsToolbarState,
  metricsToolbarReducer,
  spanToMilliseconds,
} from './metricsTypes';

export type { MetricsChartConfig } from './metricsTypes';

export interface MetricsLayoutProps {
  /** Charts to render; count and titles differ per resource (e.g. 4 vs 2). */
  charts: MetricsChartConfig[];
  /** Resource-specific metrics-type dropdown options. */
  metricsFilterOptions: MetricsFilterOption[];
  /** Namespace for Prometheus queries (routes to user workload monitoring). */
  namespace?: string;
  /** Namespaces the charts flagged acrossAppNamespaces run their queries in. */
  appNamespaces?: string[];
  /** Prefix for chart panel data-test ids, e.g. broker-service-metric. */
  dataTestPrefix?: string;
}

/** Shared Metrics Overview layout for BrokerService and BrokerApp. */
export const MetricsLayout: FC<MetricsLayoutProps> = ({
  charts,
  metricsFilterOptions,
  namespace,
  appNamespaces,
  dataTestPrefix = 'metrics-chart',
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [state, dispatch] = useReducer(
    metricsToolbarReducer,
    charts,
    createInitialMetricsToolbarState,
  );

  return (
    <MetricsSection
      title={t('Metrics')}
      actions={
        <MetricsActions
          state={state}
          dispatch={dispatch}
          metricsFilterOptions={metricsFilterOptions}
        />
      }
    >
      <MetricsChartGrid>
        {state.visibleCharts.map((chart) => (
          <GalleryItem key={chart.id}>
            <MetricsChartPanel title={chart.title} dataTest={`${dataTestPrefix}-${chart.id}`}>
              {chart.acrossAppNamespaces ? (
                appNamespaces && appNamespaces.length > 0 && chart.queries.length > 0 ? (
                  <MultiNamespaceChart
                    title={chart.title}
                    namespaces={appNamespaces}
                    queries={chart.queries}
                    timespan={spanToMilliseconds(state.span)}
                    pollInterval={state.refreshIntervalMs ?? undefined}
                    units={chart.units}
                  />
                ) : (
                  <MetricsDataUnavailable />
                )
              ) : namespace && chart.queries.length > 0 ? (
                <QueryBrowser
                  namespace={namespace}
                  queries={chart.queries}
                  timespan={spanToMilliseconds(state.span)}
                  pollInterval={state.refreshIntervalMs ?? undefined}
                  showLegend
                  units={chart.units}
                />
              ) : (
                <MetricsDataUnavailable />
              )}
            </MetricsChartPanel>
          </GalleryItem>
        ))}
      </MetricsChartGrid>
    </MetricsSection>
  );
};
