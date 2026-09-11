import type { FC } from 'react';
import { useCallback, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  k8sUpdate,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, PageSection, Spinner, Title } from '@patternfly/react-core';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../reducers/brokerapp/reducer';
import { BrokerAppFormPage } from '../BrokerAppFormPage';

interface EditBrokerAppFormProps {
  brokerApp: BrokerAppCR;
  namespace: string;
  name: string;
}

/** Initializes the reducer from the watched CR and renders the form. */
const EditBrokerAppForm: FC<EditBrokerAppFormProps> = ({ brokerApp, namespace, name }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const navigate = useNavigate();
  const location = useLocation();

  const [formState, dispatch] = useReducer(brokerAppReducer, brokerApp, (cr) =>
    brokerAppReducer(createInitialBrokerAppState(namespace), {
      type: 'SET_MODEL',
      payload: cr,
      resetChanges: true,
    }),
  );

  const listPath = `/k8s/ns/${namespace}/${BrokerAppModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerAppModel.apiVersion}~${BrokerAppModel.kind}`;
  const detailsPath = `${listPath}/${name}`;

  const cancelPath = new URLSearchParams(location.search).get('returnUrl') ?? listPath;

  const handleReload = useCallback(() => {
    dispatch({ type: 'SET_MODEL', payload: brokerApp, resetChanges: true });
  }, [brokerApp]);

  return (
    <BrokerAppFormStateContext.Provider value={formState}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <BrokerAppFormPage
          title={t('Edit BrokerApp')}
          namespace={namespace}
          onSubmit={async (cr: BrokerAppCR) => {
            await k8sUpdate({ model: BrokerAppModel, data: cr });
            void navigate(detailsPath);
          }}
          onCancel={() => {
            void navigate(cancelPath);
          }}
          submitLabel={t('Save')}
          isEditMode
          onReload={handleReload}
          titleTestId="edit-brokerapp-title"
          submitButtonTestId="brokerapp-save-btn"
          cancelButtonTestId="brokerapp-cancel-btn"
          reloadButtonTestId="brokerapp-reload-btn"
        />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

/** Edit BrokerApp container — watches the CR, gates on access/loading/errors, delegates to EditBrokerAppForm. */
export default function EditBrokerAppPage() {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace = 'default', name } = useParams<{ ns: string; name: string }>();

  const [canUpdate, canUpdateLoading] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerapps',
    namespace,
    verb: 'update',
  });

  const [watchedBrokerApp, loaded, loadError] = useK8sWatchResource<BrokerAppCR>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    name: name ?? '',
    namespace,
  }) as [BrokerAppCR, boolean, unknown];

  if (!name) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerApp not found')}</Title>
      </PageSection>
    );
  }

  if (canUpdateLoading || !loaded) {
    return (
      <PageSection>
        <Spinner aria-label={t('Loading')} />
      </PageSection>
    );
  }

  if (loadError) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" titleText={t('BrokerApp not found')} status="danger">
          <EmptyStateBody>
            {loadError instanceof Error
              ? loadError.message
              : t('Failed to load the BrokerApp resource.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (!canUpdate) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" titleText={t('Access denied')} status="danger">
          <EmptyStateBody>
            {t('You do not have permission to update BrokerApps in this namespace.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  return <EditBrokerAppForm brokerApp={watchedBrokerApp} namespace={namespace} name={name} />;
}
