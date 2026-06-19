import type { FC } from 'react';
import {
  DocumentTitle,
  ListPageBody,
  ListPageCreateLink,
  ListPageHeader,
  useActiveNamespace,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { BrokerServiceModel } from '../../../k8s/models';
import type { BrokerService } from '../../../k8s/types';
import { BrokerServiceListTable } from './components/BrokerServiceListTable';

const BrokerServiceListPage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace } = useParams<{ ns?: string }>();
  const [activeNamespace] = useActiveNamespace();
  const createNamespace = namespace ?? (activeNamespace || 'default');
  const createPath = `/k8s/ns/${createNamespace}/brokerservices/~new`;

  const watchResult = useK8sWatchResource<BrokerService[]>({
    namespace,
    groupVersionKind: {
      group: BrokerServiceModel.apiGroup,
      version: BrokerServiceModel.apiVersion,
      kind: BrokerServiceModel.kind,
    },
    isList: true,
  }) as [BrokerService[], boolean, unknown];

  const [brokerServices, loaded, loadError] = watchResult;

  return (
    <>
      <DocumentTitle>{t('BrokerServices')}</DocumentTitle>
      <ListPageHeader title={t('BrokerServices')}>
        <ListPageCreateLink to={createPath}>{t('Create BrokerService')}</ListPageCreateLink>
      </ListPageHeader>
      <ListPageBody>
        <BrokerServiceListTable data={brokerServices} loaded={loaded} loadError={loadError} />
      </ListPageBody>
    </>
  );
};

export default BrokerServiceListPage;
