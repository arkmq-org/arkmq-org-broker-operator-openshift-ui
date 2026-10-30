import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { PageSection, Title } from '@patternfly/react-core';
import type { BrokerAppCR } from '../k8s/types';
import {
  validateLabelEntries,
  validateRequiredMatchLabels,
  validateYamlDuplicateBrokerAppMatchLabels,
  validateBrokerAppCR,
} from '../validation/k8s';
import { useBrokerAppFormState, useBrokerAppFormDispatch } from '../reducers/brokerapp/reducer';
import { ResourceFormEditor } from '../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from './createBrokerApp/components/GeneralDetailsSection';
import { SelectorSection } from './createBrokerApp/components/SelectorSection';
import { AddressManager } from './createBrokerApp/components/AddressManager';
import { ResourcesSection } from './createBrokerApp/components/ResourcesSection';

interface BrokerAppFormPageProps {
  title: string;
  namespace: string;
  onSubmit: (cr: BrokerAppCR) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  isEditMode?: boolean;
  /** When provided, shows a Reload button. */
  onReload?: () => void;
  titleTestId?: string;
  submitButtonTestId?: string;
  cancelButtonTestId?: string;
  reloadButtonTestId?: string;
}

/** Shared form for create and edit BrokerApp flows. Requires reducer context providers. */
export const BrokerAppFormPage: React.FC<BrokerAppFormPageProps> = ({
  title,
  namespace,
  onSubmit,
  onCancel,
  submitLabel,
  isEditMode = false,
  onReload,
  titleTestId,
  submitButtonTestId,
  cancelButtonTestId,
  reloadButtonTestId,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const formState = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  const { cr, matchLabels, hasChanges } = formState;
  const isFormValid =
    validateBrokerAppCR(cr) === null &&
    validateLabelEntries(matchLabels) === null &&
    validateRequiredMatchLabels(matchLabels) === null;

  return (
    <>
      <PageSection>
        <Title headingLevel="h1" data-test={titleTestId}>
          {title}
        </Title>
      </PageSection>
      <PageSection>
        <ResourceFormEditor
          initialResource={cr}
          isFormValid={isFormValid}
          submitLabel={submitLabel}
          onReload={onReload}
          hasChanges={hasChanges}
          resourceName={t('BrokerApp')}
          createButtonTestId={submitButtonTestId}
          cancelButtonTestId={cancelButtonTestId}
          reloadButtonTestId={reloadButtonTestId}
          onFormSubmit={() => onSubmit(cr)}
          onYamlSave={(yaml) => {
            const duplicateLabelError = validateYamlDuplicateBrokerAppMatchLabels(yaml);
            if (duplicateLabelError) {
              throw new Error(duplicateLabelError);
            }
            const parsed = jsYaml.load(yaml) as BrokerAppCR;
            const crError = validateBrokerAppCR(parsed, yaml);
            if (crError) {
              throw new Error(crError);
            }
            const selectorLabels = parsed.spec.selector?.matchLabels;
            if (!selectorLabels || !Object.keys(selectorLabels).length) {
              throw new Error('spec.selector.matchLabels: At least one match label is required');
            }
            return onSubmit(parsed);
          }}
          onSwitchToForm={(yaml) => {
            const duplicateLabelError = validateYamlDuplicateBrokerAppMatchLabels(yaml);
            if (duplicateLabelError) {
              return { ok: false, error: duplicateLabelError };
            }
            try {
              const parsed = jsYaml.load(yaml) as BrokerAppCR;
              const crError = validateBrokerAppCR(parsed, yaml);
              if (crError) {
                return { ok: false, error: crError };
              }
              dispatch({
                type: 'SET_MODEL',
                payload: parsed,
                yaml,
                preserveLabels: validateLabelEntries(matchLabels) !== null,
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
          <GeneralDetailsSection namespace={namespace} isEditMode={isEditMode} />
          <AddressManager />
          <SelectorSection namespace={namespace} />
          <ResourcesSection />
        </ResourceFormEditor>
      </PageSection>
    </>
  );
};
