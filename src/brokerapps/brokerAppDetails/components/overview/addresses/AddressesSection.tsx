import { useMemo } from 'react';
import type { FC } from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Content,
  EmptyState,
  EmptyStateBody,
  Label,
  LabelGroup,
  Stack,
  StackItem,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import type { BrokerAppCR } from '../../../../../k8s/types';
import type { AddressKind } from '../../../../../reducers/brokerapp/reducer';
import { hydrateAddresses } from '../../../../../reducers/brokerapp/reducer';
import './AddressesSection.css';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__addresses-section';

const KIND_COLORS: Record<AddressKind, 'blue' | 'grey'> = {
  owned: 'blue',
  referenced: 'grey',
};

const KIND_LABELS: Record<AddressKind, string> = {
  owned: 'Owned',
  referenced: 'Referenced',
};

export interface AddressesSectionProps {
  /** Watched BrokerApp CR from the Details page — kept in sync with the API server. */
  brokerApp: BrokerAppCR;
}

/**
 * Read-only address display for the BrokerApp Details page.
 * Hydrates the CRD address fields (addresses, capabilities) into a unified list and
 * renders them as labelled cards.
 */
export const AddressesSection: FC<AddressesSectionProps> = ({ brokerApp }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const addresses = useMemo(() => hydrateAddresses(brokerApp), [brokerApp]);

  return (
    <div data-test="broker-app-addresses-section">
      <Title headingLevel="h2" className="pf-v6-u-mb-md">
        {t('Addresses')}
      </Title>
      <Content component="p" className="pf-v6-u-mb-md">
        {t(
          'Addresses configured for this app. Owned addresses are provisioned on the broker and opened to other apps through gates. Referenced addresses belong to another app.',
        )}
      </Content>

      {addresses.length === 0 ? (
        <EmptyState headingLevel="h3" titleText={t('No addresses')} data-test="address-list-empty">
          <EmptyStateBody>{t('No addresses have been configured for this app.')}</EmptyStateBody>
        </EmptyState>
      ) : (
        <div className={`${PREFIX}-grid`} data-test="address-list">
          {addresses.map((entry, index) => (
            <Card key={index} data-test={`address-list-item-${String(index)}`}>
              <CardTitle>{entry.address}</CardTitle>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    <LabelGroup numLabels={5}>
                      <Label color={KIND_COLORS[entry.kind]} isCompact>
                        {t(KIND_LABELS[entry.kind])}
                      </Label>
                      {(entry.direction === 'produces' || entry.direction === 'both') && (
                        <Label color="green" isCompact>
                          {t('Produces')}
                        </Label>
                      )}
                      {(entry.direction === 'consumes' || entry.direction === 'both') && (
                        <Label color="orange" isCompact>
                          {t('Consumes')}
                        </Label>
                      )}
                      {!!entry.pubSub && (
                        <Label color="teal" isCompact>
                          {t('Pub/Sub')}
                        </Label>
                      )}
                      {!!entry.producerGate && (
                        <Tooltip content={entry.producerGate}>
                          <Label color="yellow" isCompact>
                            {t('Producers gated')}
                          </Label>
                        </Tooltip>
                      )}
                      {!!entry.consumerGate && (
                        <Tooltip content={entry.consumerGate}>
                          <Label color="yellow" isCompact>
                            {t('Consumers gated')}
                          </Label>
                        </Tooltip>
                      )}
                      {!!(entry.appName && entry.appNamespace) && (
                        <Label color="purple" isCompact>
                          {entry.appNamespace}/{entry.appName}
                        </Label>
                      )}
                    </LabelGroup>
                  </StackItem>
                  {entry.subscriptions && entry.subscriptions.length > 0 && (
                    <StackItem>
                      <LabelGroup numLabels={3}>
                        {entry.subscriptions.map((sub) => (
                          <Label key={sub} isCompact>
                            {sub}
                          </Label>
                        ))}
                      </LabelGroup>
                    </StackItem>
                  )}
                </Stack>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
