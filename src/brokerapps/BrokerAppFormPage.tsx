import * as React from 'react';
import { useTranslation } from 'react-i18next';
import * as jsYaml from 'js-yaml';
import { PageSection, Title } from '@patternfly/react-core';
import type { BrokerAppCR } from '../k8s/types';
import {
  validateDNS1123,
  validateLabelEntries,
  validateAddressEntries,
  validateNoDuplicateAddresses,
  validateNoAddressOverlap,
  validateYamlDuplicateBrokerAppMatchLabels,
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

  const { cr, matchLabels, addresses, hasChanges } = formState;
  const labelsValid = validateLabelEntries(matchLabels) === null;
  const addressesValid =
    validateAddressEntries(addresses.filter((a) => a.address.trim())).every(
      (e) => e === undefined,
    ) && validateNoDuplicateAddresses(addresses) === null;
  const isFormValid = isEditMode
    ? labelsValid && addressesValid
    : validateDNS1123(cr.metadata?.name ?? '') === null && labelsValid && addressesValid;

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
            const spec = (parsed as { spec?: typeof parsed.spec }).spec ?? {};
            const privateDupError = validateNoDuplicateAddresses(spec.addresses ?? []);
            if (privateDupError) {
              throw new Error(privateDupError);
            }
            const sharedDupError = validateNoDuplicateAddresses(spec.sharedAddresses ?? []);
            if (sharedDupError) {
              throw new Error(sharedDupError);
            }
            const overlapError = validateNoAddressOverlap(
              (spec.addresses ?? []).map((a) => a.address),
              (spec.sharedAddresses ?? []).map((a) => a.address),
            );
            if (overlapError) {
              throw new Error(overlapError);
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
          <AddressManager />
          <SelectorSection namespace={namespace} />
          <ResourcesSection />
        </ResourceFormEditor>
      </PageSection>
    </>
  );
};
