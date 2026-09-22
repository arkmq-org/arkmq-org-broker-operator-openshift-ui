import type { FC } from 'react';
import { useCallback, useReducer, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  k8sGet,
  k8sUpdate,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { EmptyState, EmptyStateBody, PageSection, Spinner, Title } from '@patternfly/react-core';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import {
  brokerServiceReducer,
  createBrokerServiceStateFromCr,
  BrokerServiceFormDispatchContext,
  BrokerServiceFormStateContext,
} from '../../reducers/brokerservice/reducer';
import { BrokerServiceFormPage } from '../BrokerServiceFormPage';

/** Returns a safe returnUrl from the query string, or the fallback path. */
export const resolveReturnPath = (search: string, fallbackPath: string): string => {
  const returnUrl = new URLSearchParams(search).get('returnUrl');
  if (returnUrl?.startsWith('/') && !returnUrl.startsWith('//')) {
    return returnUrl;
  }
  return fallbackPath;
};

interface EditBrokerServiceFormProps {
  brokerService: BrokerService;
  namespace: string;
  name: string;
}

/** Initializes the reducer from the watched CR and renders the form. */
const EditBrokerServiceForm: FC<EditBrokerServiceFormProps> = ({
  brokerService,
  namespace,
  name,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const navigate = useNavigate();
  const location = useLocation();

  const [formState, dispatch] = useReducer(
    brokerServiceReducer,
    brokerService,
    createBrokerServiceStateFromCr,
  );

  const listPath = `/k8s/ns/${namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}`;
  const detailsPath = `${listPath}/${name}`;

  const cancelPath = resolveReturnPath(location.search, listPath);

  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | undefined>(undefined);

  const handleReload = useCallback(async () => {
    setIsReloading(true);
    setReloadError(undefined);
    try {
      const fresh = await k8sGet<BrokerService>({
        model: BrokerServiceModel,
        name,
        ns: namespace,
      });
      dispatch({ type: 'SET_MODEL', payload: fresh, resetChanges: true });
    } catch (error) {
      setReloadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsReloading(false);
    }
  }, [name, namespace]);

  return (
    <BrokerServiceFormStateContext.Provider value={formState}>
      <BrokerServiceFormDispatchContext.Provider value={dispatch}>
        <BrokerServiceFormPage
          title={t('Edit BrokerService')}
          description={t(
            'Modify the configuration of an existing BrokerService. Changes will be applied to the running broker cluster after saving.',
          )}
          namespace={namespace}
          onSubmit={async (cr: BrokerService) => {
            await k8sUpdate({ model: BrokerServiceModel, data: cr });
            void navigate(detailsPath);
          }}
          onCancel={() => {
            void navigate(cancelPath);
          }}
          submitLabel={t('Save')}
          isEditMode
          onReload={handleReload}
          isReloading={isReloading}
          reloadError={reloadError}
          titleTestId="edit-brokerservice-title"
          submitButtonTestId="save-broker-service-button"
          cancelButtonTestId="cancel-broker-service-button"
          reloadButtonTestId="reload-broker-service-button"
        />
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

const EditBrokerServicePage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace = 'default', name = '' } = useParams<{ ns: string; name: string }>();

  const [canUpdate, canUpdateLoading] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerservices',
    namespace,
    verb: 'update',
  });

  const [brokerService, loaded, loadError] = useK8sWatchResource<BrokerService>({
    groupVersionKind: {
      group: BrokerServiceModel.apiGroup,
      version: BrokerServiceModel.apiVersion,
      kind: BrokerServiceModel.kind,
    },
    name,
    namespace,
  }) as [BrokerService | undefined, boolean, unknown];

  if (!name) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerService not found')}</Title>
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

  if (!canUpdate) {
    return (
      <PageSection>
        <EmptyState headingLevel="h1" titleText={t('Access denied')} status="danger">
          <EmptyStateBody>
            {t('You do not have permission to update BrokerServices in this namespace.')}
          </EmptyStateBody>
        </EmptyState>
      </PageSection>
    );
  }

  if (loadError || !brokerService) {
    return (
      <PageSection>
        <Title headingLevel="h1">{t('BrokerService not found')}</Title>
      </PageSection>
    );
  }

  return <EditBrokerServiceForm brokerService={brokerService} namespace={namespace} name={name} />;
};

export default EditBrokerServicePage;
