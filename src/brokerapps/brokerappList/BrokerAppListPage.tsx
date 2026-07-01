import { useTranslation } from 'react-i18next';
import {
  ListPageCreateLink,
  ListPageHeader,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { PageSection } from '@patternfly/react-core';
import {
  DataView,
  DataViewState,
  useDataViewFilters,
  useDataViewPagination,
} from '@patternfly/react-data-view';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import { BrokerAppListTable } from './components/BrokerAppListTable';
import { BrokerAppListToolbar } from './components/BrokerAppListToolbar';
import type { BrokerAppFilters } from './components/BrokerAppListToolbar';

const DEFAULT_PER_PAGE = 20;

interface BrokerAppListPageProps {
  /** Active namespace selected in the console. */
  namespace: string;
}

/** BrokerApp list page — fetches, filters, paginates, and renders BrokerApps for the selected namespace. */
export default function BrokerAppListPage({ namespace }: BrokerAppListPageProps) {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [brokerapps, loaded, loadError] = useK8sWatchResource<BrokerAppCR[]>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    isList: true,
    namespace,
  }) as [BrokerAppCR[], boolean, Error | null];

  const { filters, onSetFilters } = useDataViewFilters<BrokerAppFilters>({
    initialFilters: { name: '', status: '', provisionedService: '' },
  });

  const filteredApps = (loaded && !loadError ? brokerapps : []).filter((app) => {
    const appName = (app.metadata?.name ?? '').toLowerCase();
    const appSvc = (app.status?.provisionedService ?? '').toLowerCase();
    const appStatus = app.status?.conditions?.some(
      (c) => c.type === 'Provisioned' && c.status === 'True',
    )
      ? 'provisioned'
      : 'pending';
    return (
      appName.includes(filters.name.toLowerCase()) &&
      appStatus.includes(filters.status.toLowerCase()) &&
      appSvc.includes(filters.provisionedService.toLowerCase())
    );
  });

  const pagination = useDataViewPagination({ perPage: DEFAULT_PER_PAGE });
  const { page, perPage, onSetPage, onPerPageSelect } = pagination;

  const start = (page - 1) * perPage;
  const paginatedApps = filteredApps.slice(start, start + perPage);

  const activeState = !loaded
    ? DataViewState.loading
    : loadError
      ? DataViewState.error
      : filteredApps.length === 0
        ? DataViewState.empty
        : undefined;

  const emptyMessage =
    filters.name || filters.status || filters.provisionedService
      ? t('No BrokerApps match the search filter.')
      : t('No BrokerApps found');

  return (
    <>
      <ListPageHeader title={t('BrokerApps')}>
        <ListPageCreateLink
          to={`/k8s/ns/${namespace}/brokerapps/~new`}
          createAccessReview={{
            groupVersionKind: {
              group: BrokerAppModel.apiGroup,
              version: BrokerAppModel.apiVersion,
              kind: BrokerAppModel.kind,
            },
            namespace,
          }}
        >
          {t('Create BrokerApp')}
        </ListPageCreateLink>
      </ListPageHeader>

      <PageSection>
        <DataView activeState={activeState}>
          <BrokerAppListToolbar
            filters={filters}
            itemCount={filteredApps.length}
            page={page}
            perPage={perPage}
            onSetFilters={onSetFilters}
            onSetPage={onSetPage}
            onPerPageSelect={onPerPageSelect}
          />
          <BrokerAppListTable apps={paginatedApps} emptyMessage={emptyMessage} />
        </DataView>
      </PageSection>
    </>
  );
}
