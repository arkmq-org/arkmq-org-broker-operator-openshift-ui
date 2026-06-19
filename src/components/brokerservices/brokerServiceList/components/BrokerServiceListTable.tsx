import type { FC } from 'react';
import { useMemo } from 'react';
import {
  EmptyState,
  EmptyStateBody,
  Pagination,
  Spinner,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarItemVariant,
} from '@patternfly/react-core';
import {
  DataView,
  DataViewFilters,
  DataViewState,
  DataViewTable,
  DataViewTextFilter,
  useDataViewFilters,
  useDataViewPagination,
} from '@patternfly/react-data-view';
import { Tbody, Td, Tr } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';
import type { BrokerService } from '../../../../k8s/types';
import { BrokerServiceListRow } from './BrokerServiceListRow';

interface BrokerServiceListFilters {
  name: string;
}

const PER_PAGE_OPTIONS = [
  { title: '10', value: 10 },
  { title: '20', value: 20 },
  { title: '50', value: 50 },
  { title: '100', value: 100 },
];

const TABLE_OUIA_ID = 'BrokerServiceListTable';

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
  const { filters, onSetFilters } = useDataViewFilters<BrokerServiceListFilters>({
    initialFilters: { name: '' },
  });
  const pagination = useDataViewPagination({ perPage: 20 });
  const { page, perPage } = pagination;

  const filteredData = useMemo(
    () =>
      data.filter((service) => {
        const name = service.metadata?.name?.toLowerCase() ?? '';
        const filterValue = filters.name.toLowerCase();
        return filterValue.length === 0 || name.includes(filterValue);
      }),
    [data, filters.name],
  );

  const rows = useMemo(
    () =>
      filteredData
        .slice((page - 1) * perPage, page * perPage)
        .map((service) => BrokerServiceListRow(service)),
    [filteredData, page, perPage],
  );

  const columns = useMemo(
    () => [t('Name'), t('Namespace'), t('Status'), t('Labels'), t('Created')],
    [t],
  );

  const activeState = useMemo(() => {
    if (loadError) {
      return DataViewState.error;
    }
    if (!loaded) {
      return DataViewState.loading;
    }
    if (filteredData.length === 0) {
      return DataViewState.empty;
    }
    return undefined;
  }, [filteredData.length, loadError, loaded]);

  const errorMessage = loadError instanceof Error ? loadError.message : t('An error occurred');

  const bodyStates = useMemo(
    () => ({
      loading: (
        <Tbody>
          <Tr ouiaId={`${TABLE_OUIA_ID}-loading`}>
            <Td colSpan={columns.length}>
              <Spinner aria-label={t('Loading')} data-test="broker-service-list-loading" />
            </Td>
          </Tr>
        </Tbody>
      ),
      error: (
        <Tbody>
          <Tr ouiaId={`${TABLE_OUIA_ID}-error`}>
            <Td colSpan={columns.length}>
              <EmptyState headingLevel="h2" titleText={t('An error occurred')} status="danger">
                <EmptyStateBody>{errorMessage}</EmptyStateBody>
              </EmptyState>
            </Td>
          </Tr>
        </Tbody>
      ),
      empty: (
        <Tbody>
          <Tr ouiaId={`${TABLE_OUIA_ID}-empty`}>
            <Td colSpan={columns.length}>
              <EmptyState headingLevel="h2" titleText={t('No BrokerServices found')}>
                <EmptyStateBody>
                  {filters.name
                    ? t('No BrokerServices match your search.')
                    : t('Create a BrokerService to get started.')}
                </EmptyStateBody>
              </EmptyState>
            </Td>
          </Tr>
        </Tbody>
      ),
    }),
    [columns.length, errorMessage, filters.name, t],
  );

  const paginationControl = (
    <Pagination
      itemCount={filteredData.length}
      perPageOptions={PER_PAGE_OPTIONS}
      titles={{ paginationAriaLabel: t('BrokerServices pagination') }}
      {...pagination}
    />
  );

  return (
    <DataView activeState={activeState} ouiaId="BrokerServiceListDataView">
      <Toolbar ouiaId="BrokerServiceListToolbar">
        <ToolbarContent>
          <ToolbarItem>
            <DataViewFilters
              onChange={(_key, newValues) => {
                onSetFilters(newValues);
              }}
              values={filters}
            >
              <DataViewTextFilter
                filterId="name"
                title={t('Name')}
                placeholder={t('Filter by name')}
                data-test="broker-service-list-name-filter"
              />
            </DataViewFilters>
          </ToolbarItem>
          <ToolbarItem variant={ToolbarItemVariant.pagination} align={{ default: 'alignEnd' }}>
            {paginationControl}
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      <DataViewTable
        aria-label={t('BrokerServices')}
        ouiaId={TABLE_OUIA_ID}
        columns={columns}
        rows={rows}
        bodyStates={bodyStates}
      />
    </DataView>
  );
};
