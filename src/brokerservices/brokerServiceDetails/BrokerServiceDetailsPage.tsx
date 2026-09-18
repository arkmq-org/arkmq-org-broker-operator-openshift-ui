import type { FC } from 'react';
import type { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import {
  DocumentTitle,
  getGroupVersionKindForModel,
  HorizontalNav,
  ResourceIcon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { Flex, FlexItem, PageSection, Spinner, Title } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import { ResourceDetailsActionsMenu } from '../../shared-components/resourceDetails/ResourceDetailsActionsMenu';
import { ResourceDetailsBreadcrumb } from '../../shared-components/resourceDetails/ResourceDetailsBreadcrumb';
import { ResourceDetailsFavoriteButton } from '../../shared-components/resourceDetails/ResourceDetailsFavoriteButton';
import { ResourceStatusBadge } from '../../shared-components/resourceDetails/ResourceStatusBadge';
import { BrokerServiceOverviewTab } from './components/overview/BrokerServiceOverviewTab';
import { BrokerServiceResourcesTab } from './components/resources/BrokerServiceResourcesTab';
import { BrokerServiceYamlTab } from './components/yaml/BrokerServiceYamlTab';

export interface BrokerServiceDetailsPageProps {
  /** Active namespace from the console resource details route. */
  namespace: string;
  /** K8s model for BrokerService from the details extension. */
  model: K8sModel;
}

/** Custom details page for BrokerService (Overview, YAML, and Resources tabs). */
const BrokerServiceDetailsPage: FC<BrokerServiceDetailsPageProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { name } = useParams<{ name?: string }>();

  const [brokerService, loaded, loadError] = useK8sWatchResource<BrokerService>({
    groupVersionKind: {
      group: BrokerServiceModel.apiGroup,
      version: BrokerServiceModel.apiVersion,
      kind: BrokerServiceModel.kind,
    },
    name: name ?? '',
    namespace,
  }) as [BrokerService, boolean, unknown];

  const listPath = `/k8s/ns/${namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}`;
  const detailsPath = name ? `${listPath}/${name}` : listPath;
  const editFormPath = name
    ? `${detailsPath}/edit?returnUrl=${encodeURIComponent(detailsPath)}`
    : listPath;
  const statusLabels = {
    Running: t('Running'),
    Warning: t('Warning'),
    Failed: t('Failed'),
    Pending: t('Pending'),
  };

  const pages = [
    {
      href: '',
      name: t('Overview'),
      component: BrokerServiceOverviewTab,
    },
    {
      href: 'yaml',
      name: t('YAML'),
      component: BrokerServiceYamlTab,
    },
    {
      href: 'resources',
      name: t('Resources'),
      component: BrokerServiceResourcesTab,
    },
  ];

  if (!name || !namespace) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerService not found')}</Title>
      </PageSection>
    );
  }

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading BrokerService')} />
      </PageSection>
    );
  }

  if (loadError) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerService not found')}</Title>
      </PageSection>
    );
  }

  return (
    <>
      <DocumentTitle>{name}</DocumentTitle>
      <PageSection>
        <ResourceDetailsBreadcrumb
          listPath={listPath}
          listLabel={t('BrokerServices')}
          currentLabel={t('BrokerService details')}
          dataTest="broker-service-details-breadcrumb"
        />
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          justifyContent={{ default: 'justifyContentSpaceBetween' }}
          className="pf-v6-u-mt-md"
        >
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            spaceItems={{ default: 'spaceItemsSm' }}
          >
            <FlexItem>
              <ResourceIcon groupVersionKind={getGroupVersionKindForModel(BrokerServiceModel)} />
            </FlexItem>
            <FlexItem>
              <Title headingLevel="h1" data-test="broker-service-details-title">
                {name}
              </Title>
            </FlexItem>
            <FlexItem>
              <ResourceStatusBadge
                conditions={brokerService.status?.conditions}
                statusLabels={statusLabels}
                dataTest={`broker-service-details-status-${namespace}-${name}`}
              />
            </FlexItem>
          </Flex>
          <Flex
            alignItems={{ default: 'alignItemsCenter' }}
            spaceItems={{ default: 'spaceItemsMd' }}
          >
            <FlexItem>
              <ResourceDetailsFavoriteButton defaultName={name} />
            </FlexItem>
            <FlexItem>
              <ResourceDetailsActionsMenu
                resource={brokerService}
                model={BrokerServiceModel}
                editActionLabel={t('Edit BrokerService')}
                deleteActionLabel={t('Delete BrokerService')}
                listPath={listPath}
                editFormPath={editFormPath}
                dataTest={`broker-service-details-actions-${namespace}-${name}`}
              />
            </FlexItem>
          </Flex>
        </Flex>
      </PageSection>
      <HorizontalNav pages={pages} resource={brokerService} />
    </>
  );
};

export default BrokerServiceDetailsPage;
