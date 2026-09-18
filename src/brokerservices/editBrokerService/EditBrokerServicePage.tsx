import type { FC } from 'react';
import { useMemo, useReducer, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import {
  k8sGet,
  k8sUpdate,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Alert,
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
import {
  validateLabelEntries,
  validateMemoryValue,
  validateYamlDuplicateBrokerServiceLabels,
} from '../../validation/k8s';
import { ResourceFormEditor } from '../../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from '../createBrokerService/components/GeneralDetailsSection';
import { InfrastructureSection } from '../createBrokerService/components/InfrastructureSection';
import {
  brokerServiceReducer,
  cloneBrokerService,
  createBrokerServiceStateFromCr,
  BrokerServiceFormDispatchContext,
  BrokerServiceFormStateContext,
  type BrokerServiceFormState,
} from '../../reducers/brokerservice/reducer';

/** Returns a safe returnUrl from the query string, or the fallback details path. */
const resolveReturnPath = (search: string, fallbackPath: string): string => {
  const returnUrl = new URLSearchParams(search).get('returnUrl');
  if (returnUrl?.startsWith('/') && !returnUrl.startsWith('//')) {
    return returnUrl;
  }
  return fallbackPath;
};

/**
 * Detects unsaved edit-form changes against the cluster baseline.
 * Used to decide whether Reload and Cancel should show a confirmation modal.
 * Label rows are compared separately from the CR because add/remove row actions
 * can change form state before metadata.labels is updated.
 */
const hasFormStateChanges = (
  formState: BrokerServiceFormState,
  baseline: BrokerServiceFormState,
): boolean =>
  JSON.stringify({
    cr: formState.cr,
    labels: formState.labels,
    memoryValue: formState.memoryValue,
    memoryUnit: formState.memoryUnit,
  }) !==
  JSON.stringify({
    cr: baseline.cr,
    labels: baseline.labels,
    memoryValue: baseline.memoryValue,
    memoryUnit: baseline.memoryUnit,
  });

interface EditBrokerServiceFormProps {
  brokerService: BrokerService;
  namespace: string;
  name: string;
  returnPath: string;
}

/**
 * Edit form for an existing BrokerService.
 * Reload re-fetches the CR from the cluster and resets local form state to that snapshot.
 */
const EditBrokerServiceForm: FC<EditBrokerServiceFormProps> = ({
  brokerService,
  namespace,
  name,
  returnPath,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const navigate = useNavigate();
  const [clusterBaseline, setClusterBaseline] = useState(() => cloneBrokerService(brokerService));
  const [formResetKey, setFormResetKey] = useState(0);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadError, setReloadError] = useState<string | undefined>(undefined);

  const baselineFormState = useMemo(
    () => createBrokerServiceStateFromCr(clusterBaseline),
    [clusterBaseline],
  );

  const [formState, dispatch] = useReducer(
    brokerServiceReducer,
    clusterBaseline,
    createBrokerServiceStateFromCr,
  );

  const { cr, memoryValue, labels } = formState;
  const hasUnsavedChanges = hasFormStateChanges(formState, baselineFormState);
  const isFormValid =
    validateMemoryValue(memoryValue) === null && validateLabelEntries(labels) === null;

  const applyClusterBaseline = (baseline: BrokerService) => {
    const clonedBaseline = cloneBrokerService(baseline);
    setClusterBaseline(clonedBaseline);
    dispatch({ type: 'SET_MODEL', payload: clonedBaseline });
    setFormResetKey((key) => key + 1);
    setEditorResetKey((key) => key + 1);
  };

  const handleReload = async () => {
    setIsReloading(true);
    setReloadError(undefined);
    try {
      const fresh = await k8sGet({
        model: BrokerServiceModel,
        name,
        ns: namespace,
      });
      applyClusterBaseline(fresh);
    } catch (error) {
      setReloadError(error instanceof Error ? error.message : String(error));
      applyClusterBaseline(clusterBaseline);
    } finally {
      setIsReloading(false);
    }
  };

  const submit = async (crToSubmit: BrokerService) => {
    const dataWithVersion: BrokerService = {
      ...crToSubmit,
      metadata: {
        ...crToSubmit.metadata,
        // Always use the baseline's resourceVersion — it stays current after Reload.
        resourceVersion: clusterBaseline.metadata?.resourceVersion,
      },
    };

    await k8sUpdate({
      model: BrokerServiceModel,
      data: dataWithVersion,
      ns: namespace,
      name,
    });
    void navigate(returnPath);
  };

  return (
    <BrokerServiceFormStateContext.Provider value={formState}>
      <BrokerServiceFormDispatchContext.Provider value={dispatch}>
        <>
          <PageSection>
            <Stack hasGutter>
              <StackItem>
                <Title headingLevel="h1" size="2xl" data-test="edit-brokerservice-title">
                  {t('Edit BrokerService')}
                </Title>
              </StackItem>
              <StackItem>
                <Content>
                  {t(
                    'Modify the configuration of an existing BrokerService. Changes will be applied to the running broker cluster after saving.',
                  )}
                </Content>
              </StackItem>
            </Stack>
          </PageSection>
          <PageSection>
            {reloadError && (
              <Alert
                variant="danger"
                isInline
                title={t('An error occurred')}
                className="pf-v6-u-mb-md"
                data-test="reload-error-alert"
              >
                {reloadError}
              </Alert>
            )}
            <ResourceFormEditor
              initialResource={cr}
              editorResetKey={editorResetKey}
              hasChanges={hasUnsavedChanges}
              resourceName={t('BrokerService')}
              isReloading={isReloading}
              isFormValid={isFormValid}
              submitLabel={t('Save')}
              createButtonTestId="save-broker-service-button"
              reloadButtonTestId="reload-broker-service-button"
              cancelButtonTestId="cancel-broker-service-button"
              onFormSubmit={() => submit(cr)}
              onReload={handleReload}
              onYamlSave={(yaml) => {
                const duplicateLabelError = validateYamlDuplicateBrokerServiceLabels(yaml);
                if (duplicateLabelError) {
                  throw new Error(duplicateLabelError);
                }
                return submit(jsYaml.load(yaml) as BrokerService);
              }}
              onSwitchToForm={(yaml) => {
                const duplicateLabelError = validateYamlDuplicateBrokerServiceLabels(yaml);
                if (duplicateLabelError) {
                  return { ok: false, error: duplicateLabelError };
                }
                try {
                  const parsed = jsYaml.load(yaml) as BrokerService;
                  dispatch({
                    type: 'SET_MODEL',
                    payload: parsed,
                    preserveLabels: validateLabelEntries(labels) !== null,
                  });
                  return { ok: true };
                } catch {
                  return {
                    ok: false,
                    error: t('Cannot switch to Form view: YAML is not valid'),
                  };
                }
              }}
              onCancel={() => {
                void navigate(returnPath, { replace: true });
              }}
            >
              <GeneralDetailsSection
                key={`general-${String(formResetKey)}`}
                namespace={namespace}
                isNameReadOnly
              />

              <InfrastructureSection key={`infrastructure-${String(formResetKey)}`} />
            </ResourceFormEditor>
          </PageSection>
        </>
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

const EditBrokerServicePage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace = 'default', name = '' } = useParams<{ ns: string; name: string }>();
  const { search } = useLocation();
  const [canUpdate, canUpdateLoading] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerservices',
    namespace,
    verb: 'update',
    name,
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

  const detailsPath = `/k8s/ns/${namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}/${name}`;
  const returnPath = resolveReturnPath(search, detailsPath);

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

  return (
    <EditBrokerServiceForm
      key={brokerService.metadata?.resourceVersion ?? 'unknown'}
      brokerService={brokerService}
      namespace={namespace}
      name={name}
      returnPath={returnPath}
    />
  );
};

export default EditBrokerServicePage;
