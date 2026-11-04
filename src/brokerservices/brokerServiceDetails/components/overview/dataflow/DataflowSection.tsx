import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Content, EmptyState, EmptyStateBody, Spinner, Title } from '@patternfly/react-core';
import type { BrokerService } from '../../../../../k8s/types';
import { DataflowDiagram } from '../../../../../dataflow/DataflowDiagram';
import { DataflowIssues } from '../../../../../dataflow/DataflowIssues';
import { DataflowLegend } from '../../../../../dataflow/DataflowLegend';
import { buildDataflowGraph, claimantsOf } from '../../../../../dataflow/graph';
import { useGateUniverse } from '../../../../../dataflow/useGateUniverse';
import { useBoundBrokerApps } from '../loadedApps/useBoundBrokerApps';

export interface DataflowSectionProps {
  /** BrokerService whose bound BrokerApps are drawn together. */
  brokerService: BrokerService;
}

/**
 * The whole world of one BrokerService: every bound app's addresses, flows and gates
 * in one picture, plus the apps that claim a bound app's address and were refused,
 * since the operator never binds those. The graph is complete: a gate nobody uses is
 * an open door and a declared flow the owner refuses is drawn broken.
 */
export const DataflowSection: FC<DataflowSectionProps> = ({ brokerService }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [bound, loaded, loadError] = useBoundBrokerApps(brokerService);
  const { universe, apps: allApps } = useGateUniverse();

  // An app the owner's gate refuses is never bound, so it is not in the service's
  // list; it is found among every app the viewer can list, by what it references.
  const apps = useMemo(() => [...bound, ...claimantsOf(bound, allApps)], [bound, allApps]);
  const graph = useMemo(
    () => buildDataflowGraph({ apps, ownerApps: apps, universe, complete: true }),
    [apps, universe],
  );
  const labels = useMemo(() => ({ anyNamespace: t('Any namespace'), anyApp: t('any app') }), [t]);
  const hasAddresses = graph.nodes.some((node) => node.kind === 'address');

  return (
    <div data-test="broker-service-dataflow">
      <Title headingLevel="h2" className="pf-v6-u-mb-md">
        {t('Data flows')}
      </Title>
      <Content component="p" className="pf-v6-u-mb-md">
        {t(
          'Every app bound to this service, with its certificate and the addresses it owns, and every flow between them. A red arrow is a flow the owner refuses; a dashed orange arrow is a gate nobody uses.',
        )}
      </Content>
      {!loaded ? (
        <Spinner aria-label={t('Loading BrokerApps')} />
      ) : loadError ? (
        <Alert
          variant="warning"
          isInline
          isPlain
          title={t('Some bound apps could not be read; the picture is incomplete.')}
          className="pf-v6-u-mb-md"
          data-test="dataflow-apps-warning"
        />
      ) : null}
      {loaded && !hasAddresses ? (
        <EmptyState headingLevel="h3" titleText={t('No data flows')} data-test="dataflow-empty">
          <EmptyStateBody>{t('No bound app declares an address on this service.')}</EmptyStateBody>
        </EmptyState>
      ) : null}
      {hasAddresses ? (
        <>
          <DataflowDiagram
            graph={graph}
            labels={labels}
            dataTest="dataflow-diagram"
            height="40rem"
          />
          <DataflowLegend scope="service" />
          <DataflowIssues graph={graph} />
        </>
      ) : null}
    </div>
  );
};
