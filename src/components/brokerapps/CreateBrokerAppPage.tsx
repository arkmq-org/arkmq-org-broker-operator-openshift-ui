import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import * as jsYaml from 'js-yaml';
import { k8sCreate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, PageSection, Spinner, Title } from '@patternfly/react-core';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import { validateDNS1123 } from '../../validation/k8s';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../reducers/brokerapp/reducer';
import { ResourceFormEditor } from '../../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from './components/GeneralDetailsSection';
import { SelectorSection } from './components/SelectorSection';
import { CapabilitiesSection } from './components/CapabilitiesSection';

export default function CreateBrokerAppPage() {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace = 'default' } = useParams<{ ns: string }>();
  const navigate = useNavigate();

  const [canCreate, canCreateLoading] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerapps',
    namespace,
    verb: 'create',
  });

  const [formState, dispatch] = useReducer(
    brokerAppReducer,
    createInitialBrokerAppState(namespace),
  );

  const { cr } = formState;
  const isFormValid = validateDNS1123(cr.metadata?.name ?? '') === null;
  const listPath = `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerApp`;

  const submit = async (crToSubmit: BrokerAppCR) => {
    await k8sCreate({ model: BrokerAppModel, data: crToSubmit });
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
            {t('You do not have permission to create BrokerApps in this namespace.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return (
    <BrokerAppFormStateContext.Provider value={formState}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <>
          <PageSection>
            <Title headingLevel="h1" data-test="create-brokerapp-title">
              {t('Create BrokerApp')}
            </Title>
          </PageSection>
          <PageSection>
            <ResourceFormEditor
              initialResource={cr}
              isFormValid={isFormValid}
              createButtonTestId="brokerapp-create-btn"
              onFormSubmit={() => submit(cr)}
              onYamlSave={(yaml) => submit(jsYaml.load(yaml) as BrokerAppCR)}
              onSwitchToForm={(yaml) => {
                try {
                  dispatch({ type: 'SET_MODEL', payload: jsYaml.load(yaml) as BrokerAppCR });
                  return { ok: true };
                } catch {
                  return { ok: false, error: t('Cannot switch to Form view: YAML is not valid') };
                }
              }}
              onCancel={() => {
                void navigate(listPath);
              }}
            >
              <GeneralDetailsSection namespace={namespace} />
              <SelectorSection />
              <CapabilitiesSection />
            </ResourceFormEditor>
          </PageSection>
        </>
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
}
