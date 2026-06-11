import type { FC } from 'react';
import { useReducer } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { k8sCreate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import {
  Content,
  EmptyState,
  EmptyStateBody,
  PageSection,
  Spinner,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import { validateDNS1123, validateMemoryValue } from '../../validation/k8s';
import { ResourceFormEditor } from '../../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from './components/GeneralDetailsSection';
import { InfrastructureSection } from './components/InfrastructureSection';
import {
  brokerServiceReducer,
  createInitialBrokerServiceState,
  BrokerServiceFormStateContext,
  BrokerServiceFormDispatchContext,
} from '../../reducers/brokerservice/reducer';

const BrokerServiceCreatePage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace = 'default' } = useParams<{ ns: string }>();
  const navigate = useNavigate();

  const [canCreate, canCreateLoading] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerservices',
    namespace,
    verb: 'create',
  });

  const [formState, dispatch] = useReducer(
    brokerServiceReducer,
    createInitialBrokerServiceState(namespace),
  );

  const { cr, memoryValue } = formState;
  const isFormValid =
    validateDNS1123(cr.metadata?.name ?? '') === null && validateMemoryValue(memoryValue) === null;
  const listPath = `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerService`;

  const submit = async (crToSubmit: BrokerService) => {
    await k8sCreate({ model: BrokerServiceModel, data: crToSubmit });
    void navigate(listPath);
  };

  if (canCreateLoading) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading')} />
      </PageSection>
    );
  }

  if (!canCreate) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" titleText={t('Access denied')} status="danger">
          <EmptyStateBody>
            {t('You do not have permission to create BrokerServices in this namespace.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <BrokerServiceFormStateContext.Provider value={formState}>
      <BrokerServiceFormDispatchContext.Provider value={dispatch}>
        <>
          <PageSection>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h1" size="2xl" data-test="create-brokerservice-title">
                  {t('Create BrokerService')}
                </Title>
              </StackItem>
              <StackItem>
                <Content>
                  {t(
                    'Provision a shared messaging infrastructure broker cluster. This resource defines the underlying broker deployment that applications will connect to via BrokerApp resources.',
                  )}
                </Content>
              </StackItem>
            </Stack>
          </PageSection>
          <PageSection>
            <ResourceFormEditor
              initialResource={cr}
              isFormValid={isFormValid}
              createButtonTestId="create-broker-service-button"
              cancelButtonTestId="cancel-broker-service-button"
              onFormSubmit={() => submit(cr)}
              onYamlSave={(yaml) => submit(jsYaml.load(yaml) as BrokerService)}
              onSwitchToForm={(yaml) => {
                try {
                  dispatch({ type: 'SET_MODEL', payload: jsYaml.load(yaml) as BrokerService });
                  return { ok: true };
                } catch {
                  return {
                    ok: false,
                    error: t('Cannot switch to Form view: YAML is not valid'),
                  };
                }
              }}
              onCancel={() => {
                void navigate(listPath);
              }}
            >
              <GeneralDetailsSection namespace={namespace} />

              <InfrastructureSection />
            </ResourceFormEditor>
          </PageSection>
        </>
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

export default BrokerServiceCreatePage;
