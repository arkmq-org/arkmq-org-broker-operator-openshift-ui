import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import type { AddressKind } from '../../../reducers/brokerapp/reducer';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import {
  validatePrivateAddressEntries,
  validateDuplicateAddressEntries,
  validateAddressOverlapEntries,
} from '../../../validation/k8s';

/**
 * Form section for managing BrokerApp address entries. Renders either the
 * private (spec.addresses) or shared (spec.sharedAddresses) list depending
 * on the addressKind prop. Each entry supports an optional pub/sub toggle
 * and a list of durable subscription queue names.
 */
export const AddressManager: React.FC<{ addressKind: AddressKind }> = ({ addressKind }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const isPrivate = addressKind === 'private';
  const entries = isPrivate ? state.privateAddresses : state.sharedAddresses;
  const testPrefix = isPrivate ? 'private-address' : 'shared-address';

  const otherEntries = isPrivate ? state.sharedAddresses : state.privateAddresses;
  const requiredErrors = validatePrivateAddressEntries(entries);
  const duplicateErrors = validateDuplicateAddressEntries(entries);
  const overlapErrors = validateAddressOverlapEntries(entries, otherEntries);
  const errors = requiredErrors.map((e, i) => e ?? duplicateErrors[i] ?? overlapErrors[i]);
  const [touched, setTouched] = useState<Set<number>>(new Set());

  return (
    <FormSection title={isPrivate ? t('Private Addresses') : t('Shared Addresses')}>
      <HelperText>
        <HelperTextItem>
          {isPrivate
            ? t(
                'Addresses owned exclusively by this app. Other apps cannot reference these — to share an address, add it to spec.sharedAddresses instead.',
              )
            : t(
                'Addresses shared across multiple apps. Any app referencing the same shared address can send or receive messages on it.',
              )}
        </HelperTextItem>
      </HelperText>

      <Stack hasGutter>
        {entries.map((entry, index) => (
          <StackItem key={index}>
            <Stack hasGutter>
              <StackItem>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <FormGroup
                      label={t('Address')}
                      isRequired
                      fieldId={`${testPrefix}-${String(index)}`}
                    >
                      <TextInput
                        id={`${testPrefix}-${String(index)}`}
                        value={entry.address}
                        onChange={(_e, val) => {
                          dispatch({
                            type: 'UPDATE_ADDRESS_ENTRY',
                            payload: { addressKind, index, address: val },
                          });
                        }}
                        onBlur={() => {
                          setTouched((prev) => new Set(prev).add(index));
                        }}
                        placeholder={
                          isPrivate ? t('e.g., orders.private') : t('e.g., orders.shared')
                        }
                        validated={touched.has(index) && errors[index] ? 'error' : 'default'}
                        isRequired
                        data-test={`${testPrefix}-input-${String(index)}`}
                      />
                      {touched.has(index) && errors[index] && (
                        <FormHelperText>
                          <HelperText>
                            <HelperTextItem variant="error">{t(errors[index])}</HelperTextItem>
                          </HelperText>
                        </FormHelperText>
                      )}
                    </FormGroup>
                  </SplitItem>

                  <SplitItem style={{ paddingTop: 'var(--pf-v6-c-form__group-label--PaddingTop)' }}>
                    <Button
                      variant="plain"
                      aria-label={
                        isPrivate ? t('Remove private address') : t('Remove shared address')
                      }
                      onClick={() => {
                        dispatch({
                          type: 'REMOVE_ADDRESS_ENTRY',
                          payload: { addressKind, index },
                        });
                        setTouched((prev) => {
                          const next = new Set<number>();
                          Array.from(prev).forEach((i) => {
                            if (i < index) next.add(i);
                            else if (i > index) next.add(i - 1);
                          });
                          return next;
                        });
                      }}
                      icon={<TimesIcon />}
                      data-test={`remove-${testPrefix}-${String(index)}`}
                    />
                  </SplitItem>
                </Split>
              </StackItem>

              <StackItem>
                <Switch
                  id={`${testPrefix}-pubsub-${String(index)}`}
                  label={entry.pubSub ? t('Publish / Subscribe') : t('Point-to-Point')}
                  isChecked={entry.pubSub ?? false}
                  onChange={(_e, checked) => {
                    dispatch({
                      type: 'UPDATE_ADDRESS_ENTRY',
                      payload: { addressKind, index, pubSub: checked },
                    });
                  }}
                  data-test={`${testPrefix}-pubsub-${String(index)}`}
                />
              </StackItem>

              {entry.pubSub && (
                <StackItem>
                  <FormGroup
                    label={t('Subscriptions')}
                    fieldId={`${testPrefix}-subscriptions-${String(index)}`}
                  >
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem>
                          {t('Durable subscription queue names for this address.')}
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                    <SubscriptionListInput
                      inputId={`${testPrefix}-subscriptions-${String(index)}`}
                      addressKind={addressKind}
                      addressIndex={index}
                      subscriptions={entry.subscriptions ?? []}
                    />
                  </FormGroup>
                </StackItem>
              )}
            </Stack>
          </StackItem>
        ))}

        <StackItem>
          <Button
            variant="link"
            icon={<PlusCircleIcon />}
            onClick={() => {
              dispatch({ type: 'ADD_ADDRESS_ENTRY', payload: { addressKind } });
            }}
            data-test={`add-${testPrefix}-btn`}
          >
            {isPrivate ? t('Add private address') : t('Add shared address')}
          </Button>
        </StackItem>
      </Stack>
    </FormSection>
  );
};

/**
 * Inline chip input for managing durable subscription queue names on a single
 * address entry. Dispatches ADD_SUBSCRIPTION / REMOVE_SUBSCRIPTION directly so
 * the parent does not need to build or pass callback functions.
 *
 * @param inputId - HTML id for the text input, used for label association
 * @param addressIndex - Position of the owning address entry in the list; forwarded in dispatch payloads
 * @param subscriptions - Current list of subscription names for display
 */
const SubscriptionListInput: React.FC<{
  inputId: string;
  addressKind: AddressKind;
  addressIndex: number;
  subscriptions: string[];
}> = ({ inputId, addressKind, addressIndex, subscriptions }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const dispatch = useBrokerAppFormDispatch();
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !subscriptions.includes(trimmed)) {
      dispatch({
        type: 'ADD_SUBSCRIPTION',
        payload: { addressKind, addressIndex, name: trimmed },
      });
    }
    setInputValue('');
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape') {
      setInputValue('');
      setIsAdding(false);
    }
  };

  return (
    <LabelGroup
      categoryName={t('Subscriptions')}
      isEditable
      addLabelControl={
        isAdding ? (
          <TextInput
            id={inputId}
            value={inputValue}
            onChange={(_e, val) => {
              setInputValue(val);
            }}
            onBlur={handleConfirm}
            onKeyDown={handleKeyDown}
            placeholder={t('e.g., my-subscription')}
            autoFocus
          />
        ) : (
          <Label
            variant="add"
            onClick={() => {
              setIsAdding(true);
            }}
          >
            {t('Add subscription')}
          </Label>
        )
      }
    >
      {subscriptions.map((sub) => (
        <Label
          key={sub}
          onClose={() => {
            dispatch({
              type: 'REMOVE_SUBSCRIPTION',
              payload: { addressKind, addressIndex, name: sub },
            });
          }}
          closeBtnAriaLabel={`${t('Remove')} ${sub}`}
        >
          {sub}
        </Label>
      ))}
    </LabelGroup>
  );
};
