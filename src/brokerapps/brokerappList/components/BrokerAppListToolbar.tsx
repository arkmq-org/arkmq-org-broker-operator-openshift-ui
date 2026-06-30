import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactElement,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Pagination } from '@patternfly/react-core';
import { DataViewFilters, DataViewTextFilter, DataViewToolbar } from '@patternfly/react-data-view';

/** Filter values used by the BrokerApp list toolbar and page. */
export interface BrokerAppFilters {
  name: string;
  status: string;
  provisionedService: string;
}

interface BrokerAppListToolbarProps {
  filters: BrokerAppFilters;
  itemCount: number;
  page: number;
  perPage: number;
  onSetFilters: (values: Partial<BrokerAppFilters>) => void;
  onSetPage: (
    _event: MouseEvent | ReactMouseEvent | ReactKeyboardEvent | undefined,
    page: number,
  ) => void;
  onPerPageSelect: (
    _event: MouseEvent | ReactMouseEvent | ReactKeyboardEvent | undefined,
    perPage: number,
  ) => void;
}

/** BrokerApp list toolbar — text filters for name, status, and provisioned service plus pagination. */
export function BrokerAppListToolbar({
  filters,
  itemCount,
  page,
  perPage,
  onSetFilters,
  onSetPage,
  onPerPageSelect,
}: BrokerAppListToolbarProps): ReactElement {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <DataViewToolbar
      filters={
        <DataViewFilters
          onChange={(_key: string, values: Partial<BrokerAppFilters>) => {
            onSetFilters(values);
          }}
          values={filters}
        >
          <DataViewTextFilter
            filterId="name"
            title={t('Name')}
            placeholder={t('Search by name...')}
            data-test="brokerapp-search"
          />
          <DataViewTextFilter
            filterId="status"
            title={t('Status')}
            placeholder={t('Filter by status...')}
            data-test="brokerapp-status-filter"
          />
          <DataViewTextFilter
            filterId="provisionedService"
            title={t('Provisioned Service')}
            placeholder={t('Filter by provisioned service...')}
            data-test="brokerapp-service-filter"
          />
        </DataViewFilters>
      }
      pagination={
        <Pagination
          itemCount={itemCount}
          perPage={perPage}
          page={page}
          onSetPage={onSetPage}
          onPerPageSelect={onPerPageSelect}
          data-test="brokerapp-pagination"
        />
      }
    />
  );
}
