import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { PageSection, Title } from '@patternfly/react-core';
import type { BrokerAppCR } from '../k8s/types';
import {
  validateDNS1123,
  validateLabelEntries,
  validateYamlDuplicateBrokerAppMatchLabels,
} from '../validation/k8s';
import { useBrokerAppFormState, useBrokerAppFormDispatch } from '../reducers/brokerapp/reducer';
import { ResourceFormEditor } from '../shared-components/ResourceFormEditor';
import { GeneralDetailsSection } from './createBrokerApp/components/GeneralDetailsSection';
import { SelectorSection } from './createBrokerApp/components/SelectorSection';
import { CapabilitiesSection } from './createBrokerApp/components/CapabilitiesSection';
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
  const labelsValid = validateLabelEntries(matchLabels) === null;
  const isFormValid = isEditMode
    ? labelsValid
    : validateDNS1123(cr.metadata?.name ?? '') === null && labelsValid;

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
            return onSubmit(jsYaml.load(yaml) as BrokerAppCR);
          }}
          onSwitchToForm={(yaml) => {
            const duplicateLabelError = validateYamlDuplicateBrokerAppMatchLabels(yaml);
            if (duplicateLabelError) {
              return { ok: false, error: duplicateLabelError };
            }
            try {
              const parsed = jsYaml.load(yaml) as BrokerAppCR;
              dispatch({
                type: 'SET_MODEL',
                payload: parsed,
                preserveLabels: validateLabelEntries(matchLabels) !== null,
              });
              return { ok: true };
            } catch {
              return { ok: false, error: t('Cannot switch to Form view: YAML is not valid') };
            }
          }}
          onCancel={onCancel}
        >
          <GeneralDetailsSection namespace={namespace} isEditMode={isEditMode} />
          <SelectorSection namespace={namespace} />
          <CapabilitiesSection />
          <ResourcesSection />
        </ResourceFormEditor>
      </PageSection>
    </>
  );
};
