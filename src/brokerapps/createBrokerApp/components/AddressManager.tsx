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
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import { PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import type { AddressOwnership, AddressDirection } from '../../../reducers/brokerapp/reducer';
import { validateAddressEntries, validateDuplicateAddressEntries } from '../../../validation/k8s';

const OWNERSHIP_OPTIONS: { value: AddressOwnership; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'shared', label: 'Shared' },
  { value: 'external', label: 'External' },
];

const DIRECTION_OPTIONS: { value: AddressDirection; label: string }[] = [
  { value: 'produces', label: 'Produces' },
  { value: 'consumes', label: 'Consumes' },
  { value: 'both', label: 'Both' },
];

/**
 * Form section for managing all BrokerApp addresses in a single list.
 * Each row captures ownership (private/shared/external), messaging direction
 * (produces/consumes/both), and optionally the messaging pattern (point-to-point
 * or pub/sub with durable subscriptions). External addresses hide the pattern
 * controls since the broker does not provision them.
 */
export const AddressManager: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  const requiredErrors = validateAddressEntries(state.addresses);
  const duplicateErrors = validateDuplicateAddressEntries(state.addresses);
  const errors = requiredErrors.map((e, i) => e ?? duplicateErrors[i]);
  const [touched, setTouched] = useState<Set<number>>(new Set());

  const [openOwnership, setOpenOwnership] = useState<number | null>(null);
  const [openDirection, setOpenDirection] = useState<number | null>(null);

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Manage the addresses for this app. Private and shared addresses are provisioned on the broker. External addresses reference addresses owned by other apps.',
          )}
        </HelperTextItem>
      </HelperText>

      <Stack hasGutter>
        {state.addresses.map((entry, index) => {
          const isExternal = entry.ownership === 'external';

          return (
            <StackItem key={index}>
              <Stack hasGutter>
                <StackItem>
                  <Split hasGutter>
                    <SplitItem isFilled>
                      <FormGroup
                        label={t('Address')}
                        isRequired
                        fieldId={`address-name-${String(index)}`}
                      >
                        <TextInput
                          id={`address-name-${String(index)}`}
                          value={entry.address}
                          onChange={(_e, val) => {
                            dispatch({
                              type: 'UPDATE_ADDRESS',
                              payload: { index, address: val },
                            });
                          }}
                          onBlur={() => {
                            setTouched((prev) => new Set(prev).add(index));
                          }}
                          placeholder={t('e.g., orders.created')}
                          validated={touched.has(index) && errors[index] ? 'error' : 'default'}
                          isRequired
                          data-test={`address-name-input-${String(index)}`}
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

                    <SplitItem>
                      <FormGroup
                        label={t('Ownership')}
                        fieldId={`address-ownership-${String(index)}`}
                      >
                        <Select
                          isOpen={openOwnership === index}
                          onOpenChange={(isOpen) => {
                            setOpenOwnership(isOpen ? index : null);
                          }}
                          onSelect={(_e, val) => {
                            dispatch({
                              type: 'UPDATE_ADDRESS',
                              payload: { index, ownership: val as AddressOwnership },
                            });
                            setOpenOwnership(null);
                          }}
                          selected={entry.ownership}
                          toggle={(toggleRef) => (
                            <MenuToggle
                              ref={toggleRef}
                              onClick={() => {
                                setOpenOwnership(openOwnership === index ? null : index);
                              }}
                              isExpanded={openOwnership === index}
                              data-test={`address-ownership-${String(index)}`}
                            >
                              {OWNERSHIP_OPTIONS.find((o) => o.value === entry.ownership)?.label}
                            </MenuToggle>
                          )}
                        >
                          <SelectList>
                            {OWNERSHIP_OPTIONS.map((opt) => (
                              <SelectOption key={opt.value} value={opt.value}>
                                {t(opt.label)}
                              </SelectOption>
                            ))}
                          </SelectList>
                        </Select>
                      </FormGroup>
                    </SplitItem>

                    <SplitItem>
                      <FormGroup
                        label={t('Direction')}
                        fieldId={`address-direction-${String(index)}`}
                      >
                        <Select
                          isOpen={openDirection === index}
                          onOpenChange={(isOpen) => {
                            setOpenDirection(isOpen ? index : null);
                          }}
                          onSelect={(_e, val) => {
                            dispatch({
                              type: 'UPDATE_ADDRESS',
                              payload: { index, direction: val as AddressDirection },
                            });
                            setOpenDirection(null);
                          }}
                          selected={entry.direction}
                          toggle={(toggleRef) => (
                            <MenuToggle
                              ref={toggleRef}
                              onClick={() => {
                                setOpenDirection(openDirection === index ? null : index);
                              }}
                              isExpanded={openDirection === index}
                              data-test={`address-direction-${String(index)}`}
                            >
                              {DIRECTION_OPTIONS.find((o) => o.value === entry.direction)?.label}
                            </MenuToggle>
                          )}
                        >
                          <SelectList>
                            {DIRECTION_OPTIONS.map((opt) => (
                              <SelectOption key={opt.value} value={opt.value}>
                                {t(opt.label)}
                              </SelectOption>
                            ))}
                          </SelectList>
                        </Select>
                      </FormGroup>
                    </SplitItem>

                    <SplitItem
                      style={{ paddingTop: 'var(--pf-v6-c-form__group-label--PaddingTop)' }}
                    >
                      <Button
                        variant="plain"
                        aria-label={t('Remove address')}
                        onClick={() => {
                          dispatch({
                            type: 'REMOVE_ADDRESS',
                            payload: { index },
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
                        data-test={`remove-address-${String(index)}`}
                      />
                    </SplitItem>
                  </Split>
                </StackItem>

                {!isExternal && (
                  <StackItem>
                    <Switch
                      id={`address-pubsub-${String(index)}`}
                      label={entry.pubSub ? t('Publish / Subscribe') : t('Point-to-Point')}
                      isChecked={entry.pubSub ?? false}
                      onChange={(_e, checked) => {
                        dispatch({
                          type: 'UPDATE_ADDRESS',
                          payload: { index, pubSub: checked },
                        });
                      }}
                      data-test={`address-pubsub-${String(index)}`}
                    />
                  </StackItem>
                )}

                {!isExternal && entry.pubSub && (
                  <StackItem>
                    <FormGroup
                      label={t('Subscriptions')}
                      fieldId={`address-subscriptions-${String(index)}`}
                    >
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem>
                            {t('Durable subscription queue names for this address.')}
                          </HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                      <SubscriptionListInput
                        inputId={`address-subscriptions-${String(index)}`}
                        addressIndex={index}
                        subscriptions={entry.subscriptions ?? []}
                      />
                    </FormGroup>
                  </StackItem>
                )}
              </Stack>
            </StackItem>
          );
        })}

        <StackItem>
          <Button
            variant="link"
            icon={<PlusCircleIcon />}
            onClick={() => {
              dispatch({ type: 'ADD_ADDRESS' });
            }}
            data-test="add-address-btn"
          >
            {t('Add address')}
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
  addressIndex: number;
  subscriptions: string[];
}> = ({ inputId, addressIndex, subscriptions }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const dispatch = useBrokerAppFormDispatch();
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !subscriptions.includes(trimmed)) {
      dispatch({
        type: 'ADD_SUBSCRIPTION',
        payload: { addressIndex, name: trimmed },
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
              payload: { addressIndex, name: sub },
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
