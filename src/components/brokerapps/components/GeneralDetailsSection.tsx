import * as React from 'react';
import { useState } from 'react';
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

type GeneralDetailsSectionProps = {
  namespace: string;
};

export const GeneralDetailsSection: React.FC<GeneralDetailsSectionProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const [touched, setTouched] = useState(false);
  const nameError = touched
    ? validateDNS1123(state.cr.metadata?.name ?? '') ?? undefined
    : undefined;

  return (
    <FormSection title={t('Application Details')}>
      <FormGroup label={t('Name')} isRequired fieldId="brokerapp-name">
        <TextInput
          id="brokerapp-name"
          value={state.cr.metadata?.name ?? ''}
          onChange={(_e, val) => {
            setTouched(true);
            dispatch({ type: 'SET_NAME', payload: val });
          }}
          isRequired
          placeholder="my-messaging-app"
          validated={nameError ? 'error' : 'default'}
          data-test="brokerapp-name"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={nameError ? 'error' : 'default'}>
              {nameError || t('Unique name for the BrokerApp resource.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Namespace')} fieldId="brokerapp-namespace">
        <TextInput id="brokerapp-namespace" value={namespace} isDisabled />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Use the project selector above to change the namespace.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>
    </FormSection>
  );
};
