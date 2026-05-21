import * as React from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
} from '../../../reducers/brokerapp/reducer';

export const SelectorSection: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  return (
    <FormSection title={t('Service Selector')}>
      <FormGroup fieldId="brokerapp-selector">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                'Enter labels to match a BrokerService. Your app will be provisioned to a service with matching labels.',
              )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <Stack hasGutter>
          {state.matchLabels.map((label) => (
            <StackItem key={label.id}>
              <Split hasGutter>
                <SplitItem isFilled>
                  <TextInput
                    value={label.key}
                    onChange={(_e, val) =>
                      dispatch({
                        type: 'UPDATE_MATCH_LABEL',
                        payload: { id: label.id, key: val, value: label.value },
                      })
                    }
                    placeholder={t('Key (e.g., tier)')}
                    aria-label={t('Label key')}
                  />
                </SplitItem>
                <SplitItem className="pf-v6-u-color-200 pf-v6-u-flex-shrink-0">=</SplitItem>
                <SplitItem isFilled>
                  <TextInput
                    value={label.value}
                    onChange={(_e, val) =>
                      dispatch({
                        type: 'UPDATE_MATCH_LABEL',
                        payload: { id: label.id, key: label.key, value: val },
                      })
                    }
                    placeholder={t('Value (e.g., production)')}
                    aria-label={t('Label value')}
                  />
                </SplitItem>
                <SplitItem>
                  <Button
                    variant="plain"
                    onClick={() => dispatch({ type: 'REMOVE_MATCH_LABEL', payload: label.id })}
                    aria-label={t('Remove label')}
                    isDisabled={state.matchLabels.length === 1}
                    icon={<TimesIcon />}
                  />
                </SplitItem>
              </Split>
            </StackItem>
          ))}
          <StackItem>
            <Button
              variant="link"
              onClick={() => dispatch({ type: 'ADD_MATCH_LABEL' })}
              icon={<PlusCircleIcon />}
            >
              {t('Add Match Label')}
            </Button>
          </StackItem>
        </Stack>
      </FormGroup>
    </FormSection>
  );
};
