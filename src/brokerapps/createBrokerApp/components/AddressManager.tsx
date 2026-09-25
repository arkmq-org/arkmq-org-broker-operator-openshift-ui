import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Switch,
  TextInput,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@patternfly/react-core';
import {
  OutlinedQuestionCircleIcon,
  PencilAltIcon,
  PlusCircleIcon,
  TimesIcon,
} from '@patternfly/react-icons';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import type { AddressOwnership, AddressDirection } from '../../../reducers/brokerapp/reducer';
import { validateAddressEntries, validateDuplicateAddressEntries } from '../../../validation/k8s';
import './AddressManager.css';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__address-manager';

const OWNERSHIP_OPTIONS: { value: AddressOwnership; label: string }[] = [
  { value: 'private', label: 'Private' },
  { value: 'shared', label: 'Shared' },
  { value: 'external', label: 'External' },
];

const OWNERSHIP_COLORS = {
  private: 'blue',
  shared: 'yellow',
  external: 'grey',
} as const;

// Card-grid form section for managing BrokerApp addresses.
export const AddressManager: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  const requiredErrors = validateAddressEntries(state.addresses);
  const duplicateErrors = validateDuplicateAddressEntries(state.addresses);
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);

  const handleAdd = () => {
    setAnimatingIndex(state.addresses.length);
    dispatch({ type: 'ADD_ADDRESS' });
    setEditingIndex(state.addresses.length);
    setIsNewEntry(true);
  };

  const handleRemove = (index: number) => {
    dispatch({ type: 'REMOVE_ADDRESS', payload: { index } });

    setTouched((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });

    if (editingIndex !== null) {
      if (editingIndex === index) {
        setEditingIndex(null);
      } else if (editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    }
  };

  const handleSaveModal = () => {
    if (editingIndex !== null) {
      setTouched((prev) => new Set(prev).add(editingIndex));
    }
    setEditingIndex(null);
    setIsNewEntry(false);
  };

  // Discard unsaved changes when cancelled
  const handleCancelModal = () => {
    if (isNewEntry && editingIndex !== null) {
      dispatch({ type: 'REMOVE_ADDRESS', payload: { index: editingIndex } });
    }
    setEditingIndex(null);
    setIsNewEntry(false);
  };

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Manage the addresses for this app. Private and shared addresses are provisioned on the broker. External addresses reference addresses owned by other apps.',
          )}
        </HelperTextItem>
      </HelperText>

      <div className={`${PREFIX}-grid`} data-test="address-list">
        {state.addresses.map((entry, index) => {
          const errorMessage =
            duplicateErrors[index] ?? (touched.has(index) ? requiredErrors[index] : undefined);

          return (
            <Card
              key={index}
              className={`${PREFIX}-card${animatingIndex === index ? ` ${PREFIX}-card--flip-in` : ''}${errorMessage ? ` ${PREFIX}-card--error` : ''}`}
              onAnimationEnd={() => {
                if (animatingIndex === index) setAnimatingIndex(null);
              }}
              data-test={`address-list-item-${String(index)}`}
            >
              <CardHeader
                actions={{
                  actions: (
                    <>
                      <Button
                        variant="plain"
                        aria-label={t('Edit address')}
                        onClick={() => {
                          setEditingIndex(index);
                          setIsNewEntry(false);
                        }}
                        icon={<PencilAltIcon />}
                        data-test={`edit-address-${String(index)}`}
                      />
                      <Button
                        variant="plain"
                        aria-label={t('Remove address')}
                        onClick={() => {
                          handleRemove(index);
                        }}
                        icon={<TimesIcon />}
                        data-test={`remove-address-${String(index)}`}
                      />
                    </>
                  ),
                  hasNoOffset: true,
                }}
              >
                <CardTitle className={!entry.address ? `${PREFIX}-card-name--empty` : undefined}>
                  {entry.address || t('New address')}
                </CardTitle>
              </CardHeader>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    <LabelGroup>
                      <Label color={OWNERSHIP_COLORS[entry.ownership]} isCompact>
                        {t(OWNERSHIP_OPTIONS.find((o) => o.value === entry.ownership)?.label ?? '')}
                      </Label>
                      {(entry.direction === 'produces' || entry.direction === 'both') && (
                        <Label color="green" isCompact>
                          {t('Produces')}
                        </Label>
                      )}
                      {(entry.direction === 'consumes' || entry.direction === 'both') && (
                        <Label color="orange" isCompact>
                          {t('Consumes')}
                        </Label>
                      )}
                      {!!(entry.ownership !== 'external' && entry.pubSub) && (
                        <Label color="teal" isCompact>
                          {t('Pub/Sub')}
                        </Label>
                      )}
                      {!!(entry.appName && entry.appNamespace) && (
                        <Label color="purple" isCompact>
                          {entry.appNamespace}/{entry.appName}
                        </Label>
                      )}
                    </LabelGroup>
                  </StackItem>
                  {entry.subscriptions && entry.subscriptions.length > 0 && (
                    <StackItem>
                      <LabelGroup numLabels={3}>
                        {entry.subscriptions.map((sub) => (
                          <Label key={sub} isCompact>
                            {sub}
                          </Label>
                        ))}
                      </LabelGroup>
                    </StackItem>
                  )}
                  {errorMessage && (
                    <StackItem>
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{t(errorMessage)}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </StackItem>
                  )}
                </Stack>
              </CardBody>
            </Card>
          );
        })}

        <Card
          className={`${PREFIX}-add-card`}
          onClick={handleAdd}
          data-test="add-address-btn"
          isClickable
        >
          <CardBody className={`${PREFIX}-add-card-body`}>
            <PlusCircleIcon className={`${PREFIX}-add-card-icon`} />
            <span>{t('Add address')}</span>
          </CardBody>
        </Card>
      </div>

      {editingIndex !== null && editingIndex < state.addresses.length && (
        <AddressEditModal
          index={editingIndex}
          onSave={handleSaveModal}
          onCancel={handleCancelModal}
        />
      )}
    </FormSection>
  );
};

/**
 * Renders a help icon wrapped in a Tooltip, sized for use in FormGroup labelHelp.
 * Styled as a bare icon with no button chrome so it blends into the label row.
 *
 * Callers must pass already-translated strings so that i18next-parser can
 * statically extract the keys from the t() calls at each call site.
 */
const FieldLabelHelp: React.FC<{ ariaLabel: string; tooltip: string }> = ({
  ariaLabel,
  tooltip,
}) => (
  <Tooltip content={tooltip}>
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
      }}
      className={`${PREFIX}-help-icon`}
    >
      <OutlinedQuestionCircleIcon />
    </button>
  </Tooltip>
);

/**
 * Modal form for editing a single address entry. All fields are buffered in local state
 * and  are onlt dispatched to reducer when done is clicked. Cancelling discards chages.
 */
const AddressEditModal: React.FC<{
  index: number;
  onSave: () => void;
  onCancel: () => void;
}> = ({ index, onSave, onCancel }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const entry = state.addresses[index];

  const [localAddress, setLocalAddress] = useState(entry.address);
  const [localOwnership, setLocalOwnership] = useState<AddressOwnership>(entry.ownership);
  const [localProduces, setLocalProduces] = useState(
    entry.direction === 'produces' || entry.direction === 'both',
  );
  const [localConsumes, setLocalConsumes] = useState(
    entry.direction === 'consumes' || entry.direction === 'both',
  );
  const [localPubSub, setLocalPubSub] = useState(entry.pubSub ?? false);
  const [localSubscriptions, setLocalSubscriptions] = useState<string[]>(entry.subscriptions ?? []);
  const [localAppName, setLocalAppName] = useState(entry.appName ?? '');
  const [localAppNamespace, setLocalAppNamespace] = useState(entry.appNamespace ?? '');

  const [nameTouched, setNameTouched] = useState(false);
  const [appNameTouched, setAppNameTouched] = useState(false);
  const [appNamespaceTouched, setAppNamespaceTouched] = useState(false);

  const localAddresses = state.addresses.map((e, i) =>
    i === index ? { ...e, address: localAddress } : e,
  );
  const requiredErrors = validateAddressEntries(localAddresses);
  const duplicateErrors = validateDuplicateAddressEntries(localAddresses);
  const modalErrors = requiredErrors.map((e, i) => e ?? duplicateErrors[i]);
  const errorMessage = nameTouched ? modalErrors[index] : undefined;
  const requiredError = nameTouched ? requiredErrors[index] : undefined;

  const isExternal = localOwnership === 'external';
  const noDirection = !localProduces && !localConsumes;
  const directionError =
    noDirection && isExternal
      ? 'At least one direction is required for external addresses'
      : undefined;
  const directionWarning =
    noDirection && !isExternal && localOwnership !== 'shared'
      ? 'Without a direction this private address will only reserve the name on the broker'
      : undefined;
  const subscriptionError =
    !isExternal && localPubSub && localConsumes && !localSubscriptions.length
      ? 'At least one subscription is required for pub/sub consumers'
      : undefined;
  const hasPartialRef =
    isExternal &&
    ((localAppName.trim() && !localAppNamespace.trim()) ||
      (!localAppName.trim() && localAppNamespace.trim()));
  const appNameError =
    appNameTouched && hasPartialRef && !localAppName.trim()
      ? 'App name is required when app namespace is set'
      : undefined;
  const appNamespaceError =
    appNamespaceTouched && hasPartialRef && !localAppNamespace.trim()
      ? 'App namespace is required when app name is set'
      : undefined;
  const duplicateError = duplicateErrors[index];
  const isModalValid =
    !requiredError && !duplicateError && !directionError && !subscriptionError && !hasPartialRef;

  const handleDone = () => {
    const resolvedDirection: AddressDirection =
      localProduces && localConsumes
        ? 'both'
        : localProduces
          ? 'produces'
          : localConsumes
            ? 'consumes'
            : 'none';

    dispatch({
      type: 'UPDATE_ADDRESS',
      payload: {
        index,
        address: localAddress,
        ownership: localOwnership,
        direction: resolvedDirection,
        pubSub: isExternal ? false : localPubSub,
        subscriptions: localSubscriptions,
        appName: isExternal ? localAppName.trim() || undefined : undefined,
        appNamespace: isExternal ? localAppNamespace.trim() || undefined : undefined,
      },
    });

    onSave();
  };

  return (
    <Modal variant="medium" isOpen onClose={onCancel} aria-labelledby="edit-address-title">
      <ModalHeader title={t('Edit address')} labelId="edit-address-title" />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <FormGroup
              label={t('Address')}
              isRequired
              fieldId={`address-name-${String(index)}`}
              labelHelp={
                <FieldLabelHelp
                  ariaLabel={t('More info for Address field')}
                  tooltip={t(
                    'The name used to route messages on the broker. Private and shared addresses are provisioned with a lifecycle tied to this app.',
                  )}
                />
              }
            >
              <TextInput
                id={`address-name-${String(index)}`}
                value={localAddress}
                onChange={(_e, val) => {
                  setLocalAddress(val);
                }}
                onBlur={() => {
                  setNameTouched(true);
                }}
                placeholder={t('e.g., orders.created')}
                validated={errorMessage ? 'error' : 'default'}
                isRequired
                data-test={`address-name-input-${String(index)}`}
              />
              {errorMessage && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem variant="error">{t(errorMessage)}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>

          <StackItem>
            <Split hasGutter>
              <SplitItem isFilled>
                <FormGroup
                  label={t('Ownership')}
                  fieldId={`address-ownership-${String(index)}`}
                  labelHelp={
                    <FieldLabelHelp
                      ariaLabel={t('More info for Ownership field')}
                      tooltip={t(
                        'Private addresses can only be used by this app. Shared addresses can be referenced by other apps. External addresses reference addresses owned by another app.',
                      )}
                    />
                  }
                >
                  <ToggleGroup data-test={`address-ownership-${String(index)}`}>
                    {OWNERSHIP_OPTIONS.map((opt) => (
                      <ToggleGroupItem
                        key={opt.value}
                        text={t(opt.label)}
                        isSelected={localOwnership === opt.value}
                        onChange={() => {
                          setLocalOwnership(opt.value);
                        }}
                        data-test={`address-ownership-${opt.value}-${String(index)}`}
                      />
                    ))}
                  </ToggleGroup>
                </FormGroup>
              </SplitItem>

              <SplitItem isFilled>
                <FormGroup
                  label={t('Direction')}
                  role="group"
                  labelHelp={
                    <FieldLabelHelp
                      ariaLabel={t('More info for Direction field')}
                      tooltip={t(
                        'Determines the messaging role. Produces grants send permission to the address. Consumes grants receive permission from the address.',
                      )}
                    />
                  }
                >
                  <Checkbox
                    id={`address-direction-produces-${String(index)}`}
                    label={t('Produces')}
                    isChecked={localProduces}
                    onChange={(_e, checked) => {
                      setLocalProduces(checked);
                    }}
                    data-test={`address-direction-produces-${String(index)}`}
                  />
                  <Checkbox
                    id={`address-direction-consumes-${String(index)}`}
                    label={t('Consumes')}
                    isChecked={localConsumes}
                    onChange={(_e, checked) => {
                      setLocalConsumes(checked);
                    }}
                    data-test={`address-direction-consumes-${String(index)}`}
                  />
                  <FormHelperText
                    style={
                      directionError || directionWarning ? undefined : { visibility: 'hidden' }
                    }
                  >
                    <HelperText>
                      <HelperTextItem variant={directionError ? 'error' : 'warning'}>
                        {t(
                          directionError ??
                            directionWarning ??
                            'Without a direction this private address will only reserve the name on the broker',
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </SplitItem>
            </Split>
          </StackItem>

          {isExternal && (
            <StackItem>
              <Split hasGutter>
                <SplitItem isFilled>
                  <FormGroup
                    label={t('App name')}
                    fieldId={`address-app-name-${String(index)}`}
                    labelHelp={
                      <FieldLabelHelp
                        ariaLabel={t('More info for App name field')}
                        tooltip={t(
                          'Name of the BrokerApp that owns this address. Required together with app namespace for cross-app references.',
                        )}
                      />
                    }
                  >
                    <TextInput
                      id={`address-app-name-${String(index)}`}
                      value={localAppName}
                      onChange={(_e, val) => {
                        setLocalAppName(val);
                      }}
                      onBlur={() => {
                        setAppNameTouched(true);
                      }}
                      placeholder={t('e.g., order-generator')}
                      validated={appNameError ? 'error' : 'default'}
                      data-test={`address-app-name-input-${String(index)}`}
                    />
                    {appNameError && (
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{t(appNameError)}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    )}
                  </FormGroup>
                </SplitItem>
                <SplitItem isFilled>
                  <FormGroup
                    label={t('App namespace')}
                    fieldId={`address-app-namespace-${String(index)}`}
                    labelHelp={
                      <FieldLabelHelp
                        ariaLabel={t('More info for App namespace field')}
                        tooltip={t(
                          'Namespace of the BrokerApp that owns this address. Required together with app name for cross-app references.',
                        )}
                      />
                    }
                  >
                    <TextInput
                      id={`address-app-namespace-${String(index)}`}
                      value={localAppNamespace}
                      onChange={(_e, val) => {
                        setLocalAppNamespace(val);
                      }}
                      onBlur={() => {
                        setAppNamespaceTouched(true);
                      }}
                      placeholder={t('e.g., service-app-project')}
                      validated={appNamespaceError ? 'error' : 'default'}
                      data-test={`address-app-namespace-input-${String(index)}`}
                    />
                    {appNamespaceError && (
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{t(appNamespaceError)}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    )}
                  </FormGroup>
                </SplitItem>
              </Split>
            </StackItem>
          )}

          {!isExternal && (
            <StackItem>
              <Split hasGutter>
                <SplitItem>
                  <Switch
                    id={`address-pubsub-${String(index)}`}
                    label={localPubSub ? t('Publish / Subscribe') : t('Point-to-Point')}
                    isChecked={localPubSub}
                    onChange={(_e, checked) => {
                      setLocalPubSub(checked);
                    }}
                    data-test={`address-pubsub-${String(index)}`}
                  />
                </SplitItem>
                <SplitItem>
                  <Tooltip
                    content={t(
                      'Toggles between publish/subscribe (multicast) and point-to-point (anycast) message routing. Publish/subscribe delivers messages to all subscribers. Point-to-point delivers to one consumer.',
                    )}
                  >
                    <button
                      type="button"
                      aria-label={t('More info for Pub/Sub field')}
                      onClick={(e) => {
                        e.preventDefault();
                      }}
                      className={`${PREFIX}-help-icon`}
                    >
                      <OutlinedQuestionCircleIcon />
                    </button>
                  </Tooltip>
                </SplitItem>
              </Split>
            </StackItem>
          )}

          {!isExternal && localPubSub && (
            <StackItem>
              <FormGroup
                label={t('Subscriptions')}
                fieldId={`address-subscriptions-${String(index)}`}
                labelHelp={
                  <FieldLabelHelp
                    ariaLabel={t('More info for Subscriptions field')}
                    tooltip={t(
                      'Durable subscription queue names created on the broker. Each becomes a fully qualified queue name in the format address::queue-name.',
                    )}
                  />
                }
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
                  subscriptions={localSubscriptions}
                  onAdd={(name) => {
                    setLocalSubscriptions((prev) => [...prev, name]);
                  }}
                  onRemove={(name) => {
                    setLocalSubscriptions((prev) => prev.filter((s) => s !== name));
                  }}
                />
                {subscriptionError && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">{t(subscriptionError)}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleDone}
          isDisabled={!isModalValid}
          data-test="modal-done-btn"
        >
          {t('Done')}
        </Button>
        <Button variant="link" onClick={onCancel} data-test="modal-cancel-btn">
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

/**
 * Inline chip input for managing durable subscription queue names.
 * Controlled component — the parent owns the subscription list and
 * provides onAdd/onRemove callbacks for mutations.
 *
 * @param inputId - HTML id for the text input, used for label association
 * @param subscriptions - Current list of subscription names for display
 * @param onAdd - Callback when a new subscription name is confirmed
 * @param onRemove - Callback when a subscription chip is closed
 */
const SubscriptionListInput: React.FC<{
  inputId: string;
  subscriptions: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}> = ({ inputId, subscriptions, onAdd, onRemove }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (trimmed.includes('::')) {
      setValidationError('Subscription name must not contain "::" (FQQN format)');
      return;
    }
    if (trimmed && !subscriptions.includes(trimmed)) {
      onAdd(trimmed);
    }
    setValidationError(undefined);
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
      setValidationError(undefined);
      setIsAdding(false);
    }
  };

  return (
    <LabelGroup
      categoryName={t('Subscriptions')}
      isEditable
      addLabelControl={
        isAdding ? (
          <>
            <TextInput
              id={inputId}
              value={inputValue}
              onChange={(_e, val) => {
                setInputValue(val);
                if (validationError) setValidationError(undefined);
              }}
              onBlur={handleConfirm}
              onKeyDown={handleKeyDown}
              placeholder={t('e.g., my-subscription')}
              validated={validationError ? 'error' : 'default'}
              autoFocus
            />
            {validationError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="error">{t(validationError)}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </>
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
            onRemove(sub);
          }}
          closeBtnAriaLabel={`${t('Remove')} ${sub}`}
        >
          {sub}
        </Label>
      ))}
    </LabelGroup>
  );
};
