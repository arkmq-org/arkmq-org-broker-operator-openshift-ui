import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { k8sCreate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, PageSection, Spinner } from '@patternfly/react-core';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../reducers/brokerapp/reducer';
import { BrokerAppFormPage } from '../BrokerAppFormPage';

/**
 * Container for the "Create BrokerApp" flow.
 * Sets up the reducer with an empty initial state and submits via k8sCreate.
 */
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

  const listPath = `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerApp`;

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
        <BrokerAppFormPage
          title={t('Create BrokerApp')}
          namespace={namespace}
          onSubmit={async (cr: BrokerAppCR) => {
            await k8sCreate({ model: BrokerAppModel, data: cr });
            void navigate(listPath);
          }}
          onCancel={() => {
            void navigate(listPath);
          }}
          titleTestId="create-brokerapp-title"
          submitButtonTestId="brokerapp-create-btn"
        />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
}
