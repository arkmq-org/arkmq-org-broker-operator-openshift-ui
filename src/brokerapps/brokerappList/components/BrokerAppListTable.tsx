import type { FC } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BrokerAppCR } from '../../../k8s/types';
import { ResourceListDataView } from '../../../shared-components/resourceList/ResourceListDataView';
import { BrokerAppListRow } from './BrokerAppListRow';

export interface BrokerAppListTableProps {
  data: BrokerAppCR[];
  loaded: boolean;
  loadError: unknown;
}

/** Binds BrokerApp columns and row rendering to the shared ResourceListDataView. */
export const BrokerAppListTable: FC<BrokerAppListTableProps> = ({ data, loaded, loadError }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const columns = useMemo(
    () => [
      t('Name'),
      t('Namespace'),
      t('Status'),
      t('Provisioned To'),
      t('Created'),
      { cell: '', props: { screenReaderText: t('Actions') } },
    ],
    [t],
  );

  const renderRow = useCallback(
    (app: BrokerAppCR) =>
      BrokerAppListRow(app, {
        editActionLabel: t('Edit BrokerApp'),
        deleteActionLabel: t('Delete BrokerApp'),
        nameError: t('Name is required.'),
        namespaceError: t('Namespace is required.'),
        statusLabels: {
          Running: t('Deployed'),
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
      ariaLabel={t('BrokerApps')}
      ouiaId="BrokerAppListTable"
      dataViewOuiaId="BrokerAppListDataView"
      toolbarOuiaId="BrokerAppListToolbar"
      emptyTitle={t('No BrokerApps found')}
      paginationAriaLabel={t('BrokerApps pagination')}
      nameFilterDataTest="brokerapp-search"
      loadingDataTest="brokerapp-list-loading"
    />
  );
};
