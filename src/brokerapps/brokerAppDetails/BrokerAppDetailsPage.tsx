import type { FC } from 'react';
import type { K8sModel } from '@openshift-console/dynamic-plugin-sdk';
import {
  DocumentTitle,
  getGroupVersionKindForModel,
  HorizontalNav,
  ResourceIcon,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { Content, Flex, FlexItem, PageSection, Spinner, Title } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { BrokerAppModel, BrokerServiceModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import { ResourceDetailsActionsMenu } from '../../shared-components/resourceDetails/ResourceDetailsActionsMenu';
import { ResourceDetailsBreadcrumb } from '../../shared-components/resourceDetails/ResourceDetailsBreadcrumb';
import { ResourceDetailsFavoriteButton } from '../../shared-components/resourceDetails/ResourceDetailsFavoriteButton';
import { ResourceStatusBadge } from '../../shared-components/resourceDetails/ResourceStatusBadge';
import { BrokerAppOverviewTab } from './components/overview/BrokerAppOverviewTab';
import { BrokerAppResourcesTab } from './components/resources/BrokerAppResourcesTab';
import { BrokerAppYamlTab } from './components/yaml/BrokerAppYamlTab';

export interface BrokerAppDetailsPageProps {
  /** Active namespace from the console resource details route. */
  namespace: string;
  /** K8s model for BrokerApp from the details extension. */
  model: K8sModel;
}

/**
 * Custom details page for BrokerApp (Overview, YAML, and Resources tabs).
 * Displays the provisioned service link when the app has been bound by the operator.
 */
const BrokerAppDetailsPage: FC<BrokerAppDetailsPageProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { name } = useParams<{ name?: string }>();

  const [brokerApp, loaded, loadError] = useK8sWatchResource<BrokerAppCR>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    name: name ?? '',
    namespace,
  }) as [BrokerAppCR, boolean, unknown];

  const listPath = `/k8s/ns/${namespace}/${BrokerAppModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerAppModel.apiVersion}~${BrokerAppModel.kind}`;
  const detailsPath = name ? `${listPath}/${name}` : undefined;
  const editFormPath =
    name && detailsPath
      ? `/k8s/ns/${namespace}/brokerapps/${name}/edit?returnUrl=${encodeURIComponent(detailsPath)}`
      : undefined;

  const statusLabels = {
    Running: t('Provisioned'),
    Warning: t('Warning'),
    Failed: t('Failed'),
    Pending: t('Pending'),
  };

  const pages = [
    {
      href: '',
      name: t('Overview'),
      component: BrokerAppOverviewTab,
    },
    {
      href: 'yaml',
      name: t('YAML'),
      component: BrokerAppYamlTab,
    },
    {
      href: 'resources',
      name: t('Resources'),
      component: BrokerAppResourcesTab,
    },
  ];

  if (!name || !namespace) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerApp not found')}</Title>
      </PageSection>
    );
  }

  if (!loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading BrokerApp')} />
      </PageSection>
    );
  }

  if (loadError) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerApp not found')}</Title>
      </PageSection>
    );
  }

  const boundService = brokerApp.status?.service;
  const serviceDetailsPath = boundService
    ? `/k8s/ns/${boundService.namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}/${boundService.name}`
    : undefined;

  return (
    <>
      <DocumentTitle>{name}</DocumentTitle>
      <PageSection>
        <ResourceDetailsBreadcrumb
          listPath={listPath}
          listLabel={t('BrokerApps')}
          currentLabel={t('BrokerApp details')}
          dataTest="broker-app-details-breadcrumb"
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
              <ResourceIcon groupVersionKind={getGroupVersionKindForModel(BrokerAppModel)} />
            </FlexItem>
            <FlexItem>
              <Title headingLevel="h1" data-test="broker-app-details-title">
                {name}
              </Title>
            </FlexItem>
            <FlexItem>
              <ResourceStatusBadge
                conditions={brokerApp.status?.conditions}
                statusLabels={statusLabels}
                conditionType="Deployed"
                falseWithoutErrorAs="Pending"
                dataTest={`broker-app-details-status-${namespace}-${name}`}
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
                resource={brokerApp}
                model={BrokerAppModel}
                editActionLabel={t('Edit BrokerApp')}
                deleteActionLabel={t('Delete BrokerApp')}
                listPath={listPath}
                editFormPath={editFormPath}
                dataTest={`broker-app-details-actions-${namespace}-${name}`}
              />
            </FlexItem>
          </Flex>
        </Flex>
        {serviceDetailsPath && (
          <Content
            component="p"
            className="pf-v6-u-mt-sm"
            data-test="broker-app-provisioned-service"
          >
            {t('Provisioned to Service:')}{' '}
            <Link to={serviceDetailsPath}>{brokerApp.status?.service?.name}</Link>
          </Content>
        )}
      </PageSection>
      <HorizontalNav pages={pages} resource={brokerApp} />
    </>
  );
};

export default BrokerAppDetailsPage;
