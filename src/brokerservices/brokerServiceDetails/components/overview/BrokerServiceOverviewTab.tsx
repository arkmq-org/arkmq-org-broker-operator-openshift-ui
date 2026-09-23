import type { FC } from 'react';
import { PageSection, Stack, StackItem, Title } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import type { BrokerService } from '../../../../k8s/types';
import { ConditionsTable } from '../../../../shared-components/resourceDetails/ConditionsTable';
import { ResourceLabelsAndAnnotations } from '../../../../shared-components/resourceDetails/ResourceLabelsAndAnnotations';
import { BrokerServiceMetrics } from './Metrics/BrokerServiceMetrics';
import { LoadedAppsSection } from './loadedApps/LoadedAppsSection';

export interface BrokerServiceOverviewTabProps {
  /** Watched BrokerService CR passed through HorizontalNav. */
  obj?: BrokerService;
}

/** Overview tab for BrokerService details. */
export const BrokerServiceOverviewTab: FC<BrokerServiceOverviewTabProps> = ({ obj }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <PageSection data-test="broker-service-overview-tab">
      <Stack hasGutter>
        <StackItem>
          <Title headingLevel="h2" className="pf-v6-u-mb-md">
            {t('BrokerService details')}
          </Title>
          {obj ? <ResourceLabelsAndAnnotations resource={obj} /> : null}
        </StackItem>
        <StackItem>
          <BrokerServiceMetrics namespace={obj?.metadata?.namespace} name={obj?.metadata?.name} />
        </StackItem>
        <StackItem>{obj ? <LoadedAppsSection brokerService={obj} /> : null}</StackItem>
        <StackItem>
          <ConditionsTable conditions={obj?.status?.conditions} />
        </StackItem>
      </Stack>
    </PageSection>
  );
};
