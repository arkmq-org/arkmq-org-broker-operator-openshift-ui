import type { FC } from 'react';
import type { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import {
  DocumentTitle,
  isAllNamespacesKey,
  ListPageBody,
  ListPageCreateLink,
  ListPageHeader,
  useActiveNamespace,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import { BrokerAppListTable } from './components/BrokerAppListTable';

export interface BrokerAppListPageProps {
  /** Active namespace selected in the console project selector. */
  namespace: string;
  /** K8s model passed by the console resource list extension — not used directly. */
  model: K8sModel;
}

/**
 * List page for BrokerApp resources.
 * The create link is hidden for users without create permissions via createAccessReview.
 */
const BrokerAppListPage: FC<BrokerAppListPageProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [activeNamespace] = useActiveNamespace();

  const createNamespace =
    namespace && !isAllNamespacesKey(namespace)
      ? namespace
      : activeNamespace && !isAllNamespacesKey(activeNamespace)
        ? activeNamespace
        : 'default';
  const createPath = `/k8s/ns/${createNamespace}/brokerapps/~new`;

  const [brokerApps, loaded, loadError] = useK8sWatchResource<BrokerAppCR[]>({
    namespace,
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    isList: true,
  }) as [BrokerAppCR[], boolean, unknown];

  return (
    <>
      <DocumentTitle>{t('BrokerApps')}</DocumentTitle>
      <ListPageHeader title={t('BrokerApps')}>
        <ListPageCreateLink
          to={createPath}
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
      <ListPageBody>
        <BrokerAppListTable data={brokerApps} loaded={loaded} loadError={loadError} />
      </ListPageBody>
    </>
  );
};

export default BrokerAppListPage;
