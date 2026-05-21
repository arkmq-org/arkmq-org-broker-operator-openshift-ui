import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { AddressListInput } from './AddressListInput';
import {
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
} from '../../../reducers/brokerapp/reducer';

export const CapabilitiesSection: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  return (
    <FormSection title={t('Messaging Capabilities')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Specify the addresses your application needs to interact with. Leave empty if not applicable.',
          )}
        </HelperTextItem>
      </HelperText>

      <FormGroup label={t('Produces To')} fieldId="brokerapp-produces">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Addresses where your application will send messages.')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <AddressListInput
          inputId="brokerapp-produces"
          addresses={state.producerOf}
          onAdd={(addr) => dispatch({ type: 'ADD_ADDRESS', field: 'producerOf', payload: addr })}
          onRemove={(addr) =>
            dispatch({ type: 'REMOVE_ADDRESS', field: 'producerOf', payload: addr })
          }
          placeholder={t('e.g., orders.created')}
          addLabel={t('Add')}
        />
      </FormGroup>

      <FormGroup label={t('Consumes From')} fieldId="brokerapp-consumes">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Queue addresses your application will consume messages from (point-to-point).')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <AddressListInput
          inputId="brokerapp-consumes"
          addresses={state.consumerOf}
          onAdd={(addr) => dispatch({ type: 'ADD_ADDRESS', field: 'consumerOf', payload: addr })}
          onRemove={(addr) =>
            dispatch({ type: 'REMOVE_ADDRESS', field: 'consumerOf', payload: addr })
          }
          placeholder={t('e.g., payments.pending')}
          addLabel={t('Add')}
        />
      </FormGroup>

      <FormGroup label={t('Subscribes To')} fieldId="brokerapp-subscribes">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t('Topic addresses your application will subscribe to (publish-subscribe).')}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <AddressListInput
          inputId="brokerapp-subscribes"
          addresses={state.subscriberOf}
          onAdd={(addr) => dispatch({ type: 'ADD_ADDRESS', field: 'subscriberOf', payload: addr })}
          onRemove={(addr) =>
            dispatch({ type: 'REMOVE_ADDRESS', field: 'subscriberOf', payload: addr })
          }
          placeholder={t('e.g., notifications.global')}
          addLabel={t('Add')}
        />
      </FormGroup>
    </FormSection>
  );
};
