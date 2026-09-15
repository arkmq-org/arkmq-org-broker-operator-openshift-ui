import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  TextInput,
} from '@patternfly/react-core';
import {
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
} from '../../../reducers/brokerapp/reducer';
import { validateDNS1123 } from '../../../validation/k8s';

interface GeneralDetailsSectionProps {
  namespace: string;
  isEditMode?: boolean;
}

export const GeneralDetailsSection: React.FC<GeneralDetailsSectionProps> = ({
  namespace,
  isEditMode = false,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const nameError = isEditMode
    ? undefined
    : (validateDNS1123(state.cr.metadata?.name ?? '') ?? undefined);

  return (
    <FormSection title={t('Application Details')}>
      <FormGroup label={t('Name')} isRequired={!isEditMode} fieldId="brokerapp-name">
        <TextInput
          id="brokerapp-name"
          value={state.cr.metadata?.name ?? ''}
          onChange={(_e, val) => {
            dispatch({ type: 'SET_NAME', payload: val });
          }}
          isRequired={!isEditMode}
          isDisabled={isEditMode}
          placeholder="my-messaging-app"
          validated={nameError ? 'error' : 'default'}
          data-test="brokerapp-name"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={nameError ? 'error' : 'default'}>
              {isEditMode
                ? t('Resource name cannot be changed after creation.')
                : (nameError ?? t('Unique name for the BrokerApp resource.'))}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Namespace')} fieldId="brokerapp-namespace">
        <TextInput id="brokerapp-namespace" value={namespace} isDisabled />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {isEditMode
                ? t('Resource namespace cannot be changed after creation.')
                : t('Use the project selector above to change the namespace.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </FormSection>
  );
};
