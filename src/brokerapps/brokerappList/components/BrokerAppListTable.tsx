import type { HTMLAttributes, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ResourceLink, Timestamp } from '@openshift-console/dynamic-plugin-sdk';
import { Alert, EmptyState, EmptyStateBody, Spinner } from '@patternfly/react-core';
import { DataViewState, DataViewTable } from '@patternfly/react-data-view';
import type { DataViewTr } from '@patternfly/react-data-view';
import { Tbody, Td, Tr } from '@patternfly/react-table';
import { BrokerAppModel, BrokerServiceModel } from '../../../k8s/models';
import type { BrokerAppCR } from '../../../k8s/types';
import { LabelList } from '../../../shared-components/LabelList';
import { StatusBadge } from '../../../shared-components/StatusBadge';

interface BrokerAppListTableProps {
  apps: BrokerAppCR[];
  emptyMessage: string;
}

/** BrokerApp table with loading, error, and empty states driven by `DataViewState`. */
export function BrokerAppListTable({ apps, emptyMessage }: BrokerAppListTableProps): ReactElement {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const columns = [
    t('Name'),
    t('Namespace'),
    t('Status'),
    t('Selector Labels'),
    t('Provisioned Service'),
    t('Created'),
  ];

  const rows: DataViewTr[] = apps.map((app) => {
    const name = app.metadata?.name ?? '';
    const appNamespace = app.metadata?.namespace ?? '';
    const provisionedService = app.status?.provisionedService;

    return {
      id: `${appNamespace}/${name}`,
      props: { 'data-test': `brokerapp-row-${name}` } as HTMLAttributes<HTMLTableRowElement>,
      row: [
        <ResourceLink
          key="name"
          groupVersionKind={{
            group: BrokerAppModel.apiGroup,
            version: BrokerAppModel.apiVersion,
            kind: BrokerAppModel.kind,
          }}
          name={name}
          namespace={appNamespace}
        />,
        appNamespace,
        <StatusBadge
          key="status"
          status={
            app.status?.conditions?.some(
              (condition) => condition.type === 'Provisioned' && condition.status === 'True',
            )
              ? 'Provisioned'
              : 'Pending'
          }
        />,
        <LabelList key="labels" labels={app.spec.selector?.matchLabels} />,
        provisionedService ? (
          <ResourceLink
            key="service"
            groupVersionKind={{
              group: BrokerServiceModel.apiGroup,
              version: BrokerServiceModel.apiVersion,
              kind: BrokerServiceModel.kind,
            }}
            name={provisionedService}
            namespace={appNamespace}
          />
        ) : (
          <span key="no-service" data-test={`brokerapp-no-service-${name}`}>
            {'—'}
          </span>
        ),
        <Timestamp key="created" timestamp={app.metadata?.creationTimestamp} />,
      ],
    };
  });

  const bodyStates = {
    [DataViewState.loading]: (
      <Tbody>
        <Tr>
          <Td colSpan={columns.length}>
            <Spinner aria-label={t('Loading')} />
          </Td>
        </Tr>
      </Tbody>
    ),
    [DataViewState.error]: (
      <Tbody>
        <Tr>
          <Td colSpan={columns.length}>
            <Alert
              variant="danger"
              title={t('Failed to load BrokerApps.')}
              data-test="brokerapp-load-error"
            />
          </Td>
        </Tr>
      </Tbody>
    ),
    [DataViewState.empty]: (
      <Tbody>
        <Tr>
          <Td colSpan={columns.length}>
            <EmptyState
              headingLevel="h2"
              titleText={t('No BrokerApps found')}
              data-test="brokerapp-empty-state"
            >
              <EmptyStateBody>{emptyMessage}</EmptyStateBody>
            </EmptyState>
          </Td>
        </Tr>
      </Tbody>
    ),
  };

  return (
    <DataViewTable
      aria-label={t('BrokerApps')}
      variant="compact"
      columns={columns}
      rows={rows}
      bodyStates={bodyStates}
    />
  );
}
