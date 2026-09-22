import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { Alert, Content, PageSection, Stack, StackItem, Title } from '@patternfly/react-core';
import type { BrokerService } from '../k8s/types';
import {
  validateDNS1123,
  validateLabelEntries,
  validateMemoryValue,
  validateYamlDuplicateBrokerServiceLabels,
} from '../validation/k8s';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../reducers/brokerservice/reducer';
import { ResourceFormEditor } from '../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from './createBrokerService/components/GeneralDetailsSection';
import { InfrastructureSection } from './createBrokerService/components/InfrastructureSection';

interface BrokerServiceFormPageProps {
  title: string;
  description?: string;
  namespace: string;
  onSubmit: (cr: BrokerService) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  isEditMode?: boolean;
  onReload?: () => void | Promise<void>;
  isReloading?: boolean;
  reloadError?: string;
  titleTestId?: string;
  submitButtonTestId?: string;
  cancelButtonTestId?: string;
  reloadButtonTestId?: string;
}

/** Shared form for create and edit BrokerService flows. Requires reducer context providers. */
export const BrokerServiceFormPage: React.FC<BrokerServiceFormPageProps> = ({
  title,
  description,
  namespace,
  onSubmit,
  onCancel,
  submitLabel,
  isEditMode = false,
  onReload,
  isReloading,
  reloadError,
  titleTestId,
  submitButtonTestId,
  cancelButtonTestId,
  reloadButtonTestId,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const formState = useBrokerServiceFormState();
  const dispatch = useBrokerServiceFormDispatch();

  const { cr, labels, memoryValue, hasChanges } = formState;
  const labelsValid = validateLabelEntries(labels) === null;
  const memoryValid = validateMemoryValue(memoryValue) === null;
  const isFormValid = isEditMode
    ? labelsValid && memoryValid
    : validateDNS1123(cr.metadata?.name ?? '') === null && labelsValid && memoryValid;

  return (
    <>
      <PageSection>
        <Stack hasGutter>
          <StackItem>
            <Title headingLevel="h1" data-test={titleTestId}>
              {title}
            </Title>
          </StackItem>
          {description && (
            <StackItem>
              <Content>{description}</Content>
            </StackItem>
          )}
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
          isFormValid={isFormValid}
          submitLabel={submitLabel}
          onReload={onReload}
          isReloading={isReloading}
          hasChanges={hasChanges}
          resourceName={t('BrokerService')}
          createButtonTestId={submitButtonTestId}
          cancelButtonTestId={cancelButtonTestId}
          reloadButtonTestId={reloadButtonTestId}
          onFormSubmit={() => onSubmit(cr)}
          onYamlSave={(yaml) => {
            const duplicateLabelError = validateYamlDuplicateBrokerServiceLabels(yaml);
            if (duplicateLabelError) {
              throw new Error(duplicateLabelError);
            }
            return onSubmit(jsYaml.load(yaml) as BrokerService);
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
              return { ok: false, error: t('Cannot switch to Form view: YAML is not valid') };
            }
          }}
          onCancel={onCancel}
        >
          <GeneralDetailsSection namespace={namespace} isNameReadOnly={isEditMode} />
          <InfrastructureSection />
        </ResourceFormEditor>
      </PageSection>
    </>
  );
};
