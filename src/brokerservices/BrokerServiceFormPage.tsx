import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { Alert, Content, PageSection, Stack, StackItem, Title } from '@patternfly/react-core';
import type { BrokerService } from '../k8s/types';
import {
  validateBrokerServiceCR,
  validateLabelEntries,
  validateYamlDuplicateBrokerServiceLabels,
} from '../validation/k8s';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../reducers/brokerservice/reducer';
import { ResourceFormEditor } from '../shared-components/ResourceFormEditor';
import { AccessControlSection } from './createBrokerService/components/AccessControlSection';
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

  const { cr, labels, hasChanges } = formState;
  const isFormValid = validateBrokerServiceCR(cr) === null && validateLabelEntries(labels) === null;

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
            const parsed = jsYaml.load(yaml) as BrokerService;
            const crError = validateBrokerServiceCR(parsed, yaml);
            if (crError) {
              throw new Error(crError);
            }
            return onSubmit(parsed);
          }}
          onSwitchToForm={(yaml) => {
            const duplicateLabelError = validateYamlDuplicateBrokerServiceLabels(yaml);
            if (duplicateLabelError) {
              return { ok: false, error: duplicateLabelError };
            }
            try {
              const parsed = jsYaml.load(yaml) as BrokerService;
              const crError = validateBrokerServiceCR(parsed, yaml);
              if (crError) {
                return { ok: false, error: crError };
              }
              dispatch({
                type: 'SET_MODEL',
                payload: parsed,
                yaml,
                preserveLabels: validateLabelEntries(labels) !== null,
              });
              return { ok: true };
            } catch (e) {
              return {
                ok: false,
                error: e instanceof Error ? e.message : String(e),
              };
            }
          }}
          onCancel={onCancel}
        >
          <GeneralDetailsSection namespace={namespace} isNameReadOnly={isEditMode} />
          <InfrastructureSection />
          <AccessControlSection />
        </ResourceFormEditor>
      </PageSection>
    </>
  );
};
