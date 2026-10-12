import type { FC } from 'react';
import { useMemo, useReducer } from 'react';
import { Alert, GalleryItem, Stack, StackItem } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { MetricsActions } from './MetricsActions';
import { MetricsChart } from './MetricsChart';
import { MetricsChartGrid } from './MetricsCharts';
import { MetricsSection } from './MetricsSection';
import { MetricsTimeContext } from './metricsTimeContext';
import {
  type MetricsChartSpec,
  chartGroups,
  chartNamespaces,
  chartsInGroup,
  createInitialMetricsToolbarState,
  metricsToolbarReducer,
  spanToMilliseconds,
} from './metricsTypes';
import { useNamespacesWithoutMetricsAccess } from './useNamespacesWithoutMetricsAccess';

export type { MetricsChartSpec } from './metricsTypes';

export interface MetricsLayoutProps {
  /** The charts to show; the toolbar's filter lists their groups. */
  charts: MetricsChartSpec[];
  /** Prefix for chart panel data-test ids, e.g. broker-service-metric. */
  dataTestPrefix?: string;
}

/**
 * A resource's Metrics section: a toolbar setting every chart's time range,
 * refresh and filter, and the charts a feature declares. Adding a chart is
 * adding its spec; the filter, the time range and the access warning follow.
 *
 * Warns above the charts when the viewer may not read the metrics of some of
 * the namespaces they query: those series are left out, which would otherwise
 * read as idle queues.
 */
export const MetricsLayout: FC<MetricsLayoutProps> = ({
  charts,
  dataTestPrefix = 'metrics-chart',
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [state, dispatch] = useReducer(
    metricsToolbarReducer,
    undefined,
    createInitialMetricsToolbarState,
  );
  const groups = useMemo(() => chartGroups(charts), [charts]);
  const visibleCharts = useMemo(() => chartsInGroup(charts, state.group), [charts, state.group]);
  const namespaces = useMemo(() => chartNamespaces(charts), [charts]);
  const refusedNamespaces = useNamespacesWithoutMetricsAccess(namespaces);
  const time = useMemo(
    () => ({
      timespan: spanToMilliseconds(state.span),
      pollInterval: state.refreshIntervalMs ?? undefined,
    }),
    [state.span, state.refreshIntervalMs],
  );

  return (
    <MetricsSection
      title={t('Metrics')}
      actions={<MetricsActions state={state} dispatch={dispatch} groups={groups} />}
    >
      <MetricsTimeContext.Provider value={time}>
        <Stack hasGutter>
          {refusedNamespaces.length > 0 ? (
            <StackItem>
              <Alert
                variant="warning"
                isInline
                title={t("You don't have permission to see metrics for {{namespaces}}", {
                  namespaces: refusedNamespaces.join(', '),
                })}
                data-test="metrics-access-warning"
              >
                {t('Contact your administrator to request access.')}
              </Alert>
            </StackItem>
          ) : null}
          <StackItem>
            <MetricsChartGrid>
              {visibleCharts.map(({ id, title, units, queries }) => (
                <GalleryItem key={id}>
                  <MetricsChart
                    title={title}
                    units={units}
                    queries={queries}
                    dataTest={`${dataTestPrefix}-${id}`}
                  />
                </GalleryItem>
              ))}
            </MetricsChartGrid>
          </StackItem>
        </Stack>
      </MetricsTimeContext.Provider>
    </MetricsSection>
  );
};
