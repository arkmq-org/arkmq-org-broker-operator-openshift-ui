import type { FC } from 'react';
import { useReducer } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { k8sCreate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, PageSection, Spinner } from '@patternfly/react-core';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import {
  brokerServiceReducer,
  createInitialBrokerServiceState,
  BrokerServiceFormStateContext,
  BrokerServiceFormDispatchContext,
} from '../../reducers/brokerservice/reducer';
import { BrokerServiceFormPage } from '../BrokerServiceFormPage';

/** Container for the "Create BrokerService" flow. Sets up the reducer with an empty initial state and submits via k8sCreate. */
const CreateBrokerServicePage: FC = () => {
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

  const listPath = `/k8s/ns/${namespace}/broker.arkmq.org~v1beta2~BrokerService`;

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
        <BrokerServiceFormPage
          title={t('Create BrokerService')}
          description={t(
            'Provision a shared messaging infrastructure broker cluster. This resource defines the underlying broker deployment that applications will connect to via BrokerApp resources.',
          )}
          namespace={namespace}
          onSubmit={async (cr: BrokerService) => {
            await k8sCreate({ model: BrokerServiceModel, data: cr });
            void navigate(listPath);
          }}
          onCancel={() => {
            void navigate(listPath);
          }}
          titleTestId="create-brokerservice-title"
          submitButtonTestId="create-broker-service-button"
          cancelButtonTestId="cancel-broker-service-button"
        />
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

export default CreateBrokerServicePage;
