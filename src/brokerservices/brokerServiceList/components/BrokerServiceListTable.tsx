import type { FC } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BrokerService } from '../../../k8s/types';
import { ResourceListDataView } from '../../../shared-components/resourceList/ResourceListDataView';
import { BrokerServiceListRow } from './BrokerServiceListRow';

export interface BrokerServiceListTableProps {
  data: BrokerService[];
  loaded: boolean;
  loadError: unknown;
}

export const BrokerServiceListTable: FC<BrokerServiceListTableProps> = ({
  data,
  loaded,
  loadError,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const columns = useMemo(
    () => [
      t('Name'),
      t('Namespace'),
      t('Status'),
      t('Labels'),
      t('Memory Usage'),
      t('Created'),
      { cell: '', props: { screenReaderText: t('Actions') } },
    ],
    [t],
  );

  const renderRow = useCallback(
    (service: BrokerService) =>
      BrokerServiceListRow(service, {
        editActionLabel: t('Edit BrokerService'),
        deleteActionLabel: t('Delete BrokerService'),
        nameError: t('Name is required.'),
        namespaceError: t('Namespace is required.'),
        statusLabels: {
          Running: t('Running'),
          Warning: t('Warning'),
          Failed: t('Failed'),
          Pending: t('Pending'),
        },
      }),
    [t],
  );

  return (
    <ResourceListDataView
      data={data}
      loaded={loaded}
      loadError={loadError}
      columns={columns}
      renderRow={renderRow}
      ariaLabel={t('BrokerServices')}
      ouiaId="BrokerServiceListTable"
      dataViewOuiaId="BrokerServiceListDataView"
      toolbarOuiaId="BrokerServiceListToolbar"
      emptyTitle={t('No BrokerServices found')}
      paginationAriaLabel={t('BrokerServices pagination')}
      nameFilterDataTest="broker-service-list-name-filter"
      loadingDataTest="broker-service-list-loading"
    />
  );
};
