import type { FC } from 'react';
import {
  Button,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../../reducers/brokerservice/reducer';
import { validateDNS1123 } from '../../../validation/k8s';

export interface GeneralDetailsSectionProps {
  namespace: string;
}

export const GeneralDetailsSection: FC<GeneralDetailsSectionProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { cr, labels } = useBrokerServiceFormState();
  const dispatch = useBrokerServiceFormDispatch();

  const name = cr.metadata?.name ?? '';
  const nameError = validateDNS1123(name) ?? undefined;

  return (
    <FormSection title={t('General Details')}>
      <FormGroup label={t('Name')} isRequired fieldId="broker-service-name">
        <TextInput
          isRequired
          type="text"
          id="broker-service-name"
          name="broker-service-name"
          value={name}
          onChange={(_event, value) => {
            dispatch({ type: 'SET_NAME', payload: value });
          }}
          validated={nameError ? 'error' : 'default'}
          placeholder="my-messaging-service"
          data-test="broker-service-name-input"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={nameError ? 'error' : 'default'}>
              {nameError ?? t('Unique name for the BrokerService resource.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Namespace')} fieldId="broker-service-namespace">
        <TextInput
          id="broker-service-namespace"
          name="broker-service-namespace"
          value={namespace}
          type="text"
          isDisabled
          data-test="broker-service-namespace-input"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Use the project selector above to change the namespace.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
      </FormGroup>

      <FormGroup label={t('Labels')} fieldId="broker-service-labels">
        <Stack hasGutter>
          <StackItem>
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  {t('Add labels that BrokerApps can use to discover and bind to this service.')}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </StackItem>

          {labels.map((label, index) => (
            <StackItem key={index}>
              <Split hasGutter>
                <SplitItem isFilled>
                  <TextInput
                    type="text"
                    id={`label-key-${String(index)}`}
                    value={label.key}
                    onChange={(_event, val) => {
                      dispatch({ type: 'UPDATE_LABEL_KEY', payload: { index, key: val } });
                    }}
                    placeholder={t('key')}
                    aria-label={t('Label key')}
                  />
                </SplitItem>
                <SplitItem className="pf-v6-u-color-200 pf-v6-u-flex-shrink-0">=</SplitItem>
                <SplitItem isFilled>
                  <TextInput
                    type="text"
                    id={`label-value-${String(index)}`}
                    value={label.value}
                    onChange={(_event, val) => {
                      dispatch({ type: 'UPDATE_LABEL_VALUE', payload: { index, value: val } });
                    }}
                    placeholder={t('value')}
                    aria-label={t('Label value')}
                  />
                </SplitItem>
                <SplitItem>
                  <Button
                    variant="plain"
                    onClick={() => {
                      dispatch({ type: 'REMOVE_LABEL', payload: index });
                    }}
                    aria-label={t('Remove label')}
                    icon={<TimesIcon />}
                  />
                </SplitItem>
              </Split>
            </StackItem>
          ))}

          <StackItem>
            <Button
              variant="secondary"
              icon={<PlusCircleIcon />}
              onClick={() => {
                dispatch({ type: 'ADD_LABEL' });
              }}
              data-test="add-label-button"
            >
              {t('Add Label')}
            </Button>
          </StackItem>
        </Stack>
      </FormGroup>
    </FormSection>
  );
};
