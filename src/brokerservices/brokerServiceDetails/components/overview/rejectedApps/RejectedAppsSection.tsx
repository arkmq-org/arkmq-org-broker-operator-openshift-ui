import type { FC } from 'react';
import { getGroupVersionKindForModel, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { Title } from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerService, RejectedApp } from '../../../../../k8s/types';

export interface RejectedAppsSectionProps {
  /** BrokerService whose status.rejectedApps entries are listed. */
  brokerService: BrokerService;
}

/**
 * Overview table of BrokerApps rejected during provisioning validation.
 * Hidden when status.rejectedApps is absent or empty so the page stays quiet
 * when there is nothing to diagnose.
 */
export const RejectedAppsSection: FC<RejectedAppsSectionProps> = ({ brokerService }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const rejectedApps = brokerService.status?.rejectedApps;

  if (!rejectedApps?.length) {
    return null;
  }

  return (
    <div data-test="broker-service-rejected-apps">
      <Title headingLevel="h2" className="pf-v6-u-mb-md">
        {t('Rejected Apps')}
      </Title>
      <Table aria-label={t('Rejected Apps')} variant="compact">
        <Thead>
          <Tr>
            <Th>{t('App Name')}</Th>
            <Th>{t('Namespace')}</Th>
            <Th>{t('Reason')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rejectedApps.map((app) => (
            <RejectedAppRow key={`${app.namespace}/${app.name}`} app={app} />
          ))}
        </Tbody>
      </Table>
    </div>
  );
};

interface RejectedAppRowProps {
  /** One rejectedApps status entry. */
  app: RejectedApp;
}

/**
 * One rejected-app row: link to the BrokerApp when name and namespace are set,
 * plus the operator reason for the rejection.
 */
const RejectedAppRow: FC<RejectedAppRowProps> = ({ app }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { name, namespace, reason } = app;

  return (
    <Tr data-test={`rejected-app-row-${namespace}-${name}`}>
      <Td dataLabel={t('App Name')}>
        {name && namespace ? (
          <ResourceLink
            groupVersionKind={getGroupVersionKindForModel(BrokerAppModel)}
            name={name}
            namespace={namespace}
            dataTest={`rejected-app-link-${namespace}-${name}`}
          />
        ) : (
          name || '-'
        )}
      </Td>
      <Td dataLabel={t('Namespace')}>
        <span data-test={`rejected-app-namespace-${namespace}-${name}`}>{namespace || '-'}</span>
      </Td>
      <Td dataLabel={t('Reason')}>
        <span data-test={`rejected-app-reason-${namespace}-${name}`}>{reason || '-'}</span>
      </Td>
    </Tr>
  );
};
