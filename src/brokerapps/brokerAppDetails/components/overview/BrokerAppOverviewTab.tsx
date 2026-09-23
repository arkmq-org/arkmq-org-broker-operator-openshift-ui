import type { FC } from 'react';
import { PageSection, Stack, StackItem, Title } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import type { BrokerAppCR } from '../../../../k8s/types';
import { ConditionsTable } from '../../../../shared-components/resourceDetails/ConditionsTable';
import { ResourceLabelsAndAnnotations } from '../../../../shared-components/resourceDetails/ResourceLabelsAndAnnotations';
import { ConnectionInformationSection } from './connectionInformation/ConnectionInformationSection';
import { MessagingCapabilitiesSection } from './messagingCapabilities/MessagingCapabilitiesSection';
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
        <StackItem>
          <Title headingLevel="h2" className="pf-v6-u-mb-md">
            {t('BrokerApp details')}
          </Title>
          {obj ? (
            <ResourceLabelsAndAnnotations
              resource={obj}
              selectorLabels={obj.spec.selector?.matchLabels}
            />
          ) : null}
        </StackItem>
        <StackItem>
          <BrokerAppMetrics namespace={obj?.metadata?.namespace} name={obj?.metadata?.name} />
        </StackItem>
        <StackItem>
          <ConnectionInformationSection service={obj?.status?.service} />
        </StackItem>
        <StackItem>
          <MessagingCapabilitiesSection capabilities={obj?.spec.capabilities} />
        </StackItem>
        <StackItem>
          <ConditionsTable conditions={obj?.status?.conditions} />
        </StackItem>
      </Stack>
    </PageSection>
  );
};
