import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Content, EmptyState, EmptyStateBody, Title } from '@patternfly/react-core';
import type { BrokerAppCR } from '../../../../../k8s/types';
import { useBrokerAppsByRef } from '../../../../../k8s/useBrokerAppsByRef';
import { DataflowDiagram } from '../../../../../dataflow/DataflowDiagram';
import { DataflowIssues } from '../../../../../dataflow/DataflowIssues';
import { DataflowLegend } from '../../../../../dataflow/DataflowLegend';
import { buildDataflowGraph, referencedOwnerRefs } from '../../../../../dataflow/graph';
import { toTopologyModel } from '../../../../../dataflow/topologyModel';
import { useGateUniverse } from '../../../../../dataflow/useGateUniverse';

export interface AddressesSectionProps {
  /** Watched BrokerApp CR from the Details page — kept in sync with the API server. */
  brokerApp: BrokerAppCR;
}

/**
 * Read-only data flow of one BrokerApp: its own addresses, the parties its gates
 * admit, and the addresses it references, drawn as boxes and arrows. The owners of
 * referenced addresses are read one by one so the picture can show their tuple and
 * whether their gate admits this app.
 */
export const AddressesSection: FC<AddressesSectionProps> = ({ brokerApp }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { universe } = useGateUniverse();
  const ownerRefs = useMemo(() => referencedOwnerRefs(brokerApp), [brokerApp]);
  const [ownerApps, , ownersError] = useBrokerAppsByRef(ownerRefs);

  const graph = useMemo(
    () => buildDataflowGraph({ apps: [brokerApp], ownerApps, universe }),
    [brokerApp, ownerApps, universe],
  );
  const anyNamespace = t('Any namespace');
  const model = useMemo(() => toTopologyModel(graph, { anyNamespace }), [graph, anyNamespace]);
  const hasAddresses = graph.nodes.some((node) => node.kind === 'address');

  return (
    <div data-test="broker-app-addresses-section">
      <Title headingLevel="h2" className="pf-v6-u-mb-md">
        {t('Data flows')}
      </Title>
      <Content component="p" className="pf-v6-u-mb-md">
        {t(
          'Addresses are the boxes; arrows show which namespace sends to or receives from each one. Dashed arrows are what the gates allow, solid arrows what this app declares.',
        )}
      </Content>
      {ownersError ? (
        <Alert
          variant="warning"
          isInline
          isPlain
          title={t('Some owner apps could not be read; their gates are not checked.')}
          className="pf-v6-u-mb-md"
          data-test="dataflow-owners-warning"
        />
      ) : null}
      {hasAddresses ? (
        <>
          <DataflowDiagram model={model} dataTest="address-list" />
          <DataflowLegend />
          <DataflowIssues graph={graph} />
        </>
      ) : (
        <EmptyState headingLevel="h3" titleText={t('No addresses')} data-test="address-list-empty">
          <EmptyStateBody>{t('No addresses have been configured for this app.')}</EmptyStateBody>
        </EmptyState>
      )}
    </div>
  );
};
