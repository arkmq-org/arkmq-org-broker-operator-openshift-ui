import type { FC } from 'react';
import { Alert, PageSection, Stack, StackItem, Title } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BrokerServiceModel } from '../../../../k8s/models';
import type { BrokerAppCR } from '../../../../k8s/types';
import { ConditionsTable } from '../../../../shared-components/resourceDetails/ConditionsTable';
import { ResourceLabelsAndAnnotations } from '../../../../shared-components/resourceDetails/ResourceLabelsAndAnnotations';
import { ConnectionInformationSection } from './connectionInformation/ConnectionInformationSection';
import { AddressesSection } from './addresses/AddressesSection';
import { BrokerAppMetrics } from './metrics/BrokerAppMetrics';

export interface BrokerAppOverviewTabProps {
  /** Watched BrokerApp CR passed through HorizontalNav. */
  obj?: BrokerAppCR;
}

/** Overview tab for BrokerApp details. */
export const BrokerAppOverviewTab: FC<BrokerAppOverviewTabProps> = ({ obj }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <PageSection data-test="broker-app-overview-tab">
      <Stack hasGutter>
        {obj?.metadata?.deletionTimestamp && (
          <StackItem>
            <Alert
              variant="info"
              isInline
              title={t('This app is being deleted')}
              data-test="drain-in-progress-alert"
            >
              {t(
                'Message drain is in progress — the app will be removed once all pending messages are consumed.',
              )}
              {obj.status?.service && (
                <>
                  {' '}
                  <Link
                    to={`/k8s/ns/${obj.status.service.namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}/${obj.status.service.name}`}
                  >
                    {t('View drain progress')}
                  </Link>
                </>
              )}
            </Alert>
          </StackItem>
        )}
        <StackItem>
          <Title headingLevel="h2" className="pf-v6-u-mb-md">
            {t('BrokerApp details')}
          </Title>
          {obj ? (
            <ResourceLabelsAndAnnotations
              resource={obj}
              selectorLabels={
                (obj.spec as Partial<BrokerAppCR['spec']> | undefined)?.serviceSelector?.matchLabels
              }
            />
          ) : null}
        </StackItem>
        <StackItem>
          <BrokerAppMetrics app={obj} />
        </StackItem>
        <StackItem>
          <ConnectionInformationSection service={obj?.status?.service} />
        </StackItem>
        {obj ? (
          <StackItem>
            <AddressesSection key={obj.metadata?.resourceVersion} brokerApp={obj} />
          </StackItem>
        ) : null}
        <StackItem>
          <ConditionsTable conditions={obj?.status?.conditions} />
        </StackItem>
      </Stack>
    </PageSection>
  );
};
