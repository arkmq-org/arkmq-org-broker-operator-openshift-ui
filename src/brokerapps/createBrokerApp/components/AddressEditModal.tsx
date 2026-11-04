import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  FormGroup,
  FormHelperText,
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
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import type { AddressOwnership, AddressDirection } from '../../../reducers/brokerapp/reducer';
import type { BrokerAppCR } from '../../../k8s/types';
import { BrokerAppModel } from '../../../k8s/models';
import { TypeaheadSelect } from '../../../shared-components/TypeaheadSelect';
import {
  validateAddressEntries,
  validateCelExpression,
  validateDuplicateAddressEntries,
} from '../../../validation/k8s';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__address-manager';

const OWNERSHIP_OPTIONS: { value: AddressOwnership; label: string }[] = [
  { value: 'owned', label: 'Owned' },
  { value: 'external', label: 'External' },
];

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
 * and are only dispatched to reducer when Done is clicked. Cancelling discards changes.
 */
export const AddressEditModal: React.FC<{
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
  const [confirmedNamespace, setConfirmedNamespace] = useState(entry.appNamespace ?? '');
  const [confirmedAppName, setConfirmedAppName] = useState(entry.appName ?? '');
  const [localProducerSelector, setLocalProducerSelector] = useState(
    entry.producerOfAppSelector ?? '',
  );
  const [localConsumerSelector, setLocalConsumerSelector] = useState(
    entry.consumerOfAppSelector ?? '',
  );

  const [nameTouched, setNameTouched] = useState(false);
  const [appNameTouched, setAppNameTouched] = useState(false);
  const [appNamespaceTouched, setAppNamespaceTouched] = useState(false);
  const [producerSelectorTouched, setProducerSelectorTouched] = useState(false);
  const [consumerSelectorTouched, setConsumerSelectorTouched] = useState(false);

  const isExternal = localOwnership === 'external';

  const [allBrokerApps, appsLoaded, appsError] = useK8sWatchResource<BrokerAppCR[]>(
    isExternal
      ? {
          groupVersionKind: {
            group: BrokerAppModel.apiGroup,
            version: BrokerAppModel.apiVersion,
            kind: BrokerAppModel.kind,
          },
          isList: true,
        }
      : null,
  ) as [BrokerAppCR[], boolean, Error | undefined];

  const filteredNamespaces = React.useMemo((): string[] => {
    if (!appsLoaded || !Array.isArray(allBrokerApps)) return [];
    const nsSet = new Set<string>();
    for (const app of allBrokerApps) {
      const ns = app.metadata?.namespace;
      if (ns) nsSet.add(ns);
    }
    return Array.from(nsSet)
      .filter((ns) => ns.toLowerCase().includes(localAppNamespace.toLowerCase()))
      .sort();
  }, [allBrokerApps, appsLoaded, localAppNamespace]);

  const filteredApps = React.useMemo(() => {
    if (!confirmedNamespace || !appsLoaded || !Array.isArray(allBrokerApps)) return [];
    return allBrokerApps
      .filter((app) => app.metadata?.namespace === confirmedNamespace)
      .map((app) => app.metadata?.name ?? '')
      .filter(Boolean)
      .filter((name) => name.toLowerCase().includes(localAppName.toLowerCase()))
      .sort();
  }, [allBrokerApps, appsLoaded, confirmedNamespace, localAppName]);

  // The BrokerApp owning the external address, once its namespace and name are confirmed.
  const targetApp = React.useMemo(() => {
    if (!confirmedAppName || !confirmedNamespace || !appsLoaded || !Array.isArray(allBrokerApps))
      return undefined;
    return allBrokerApps.find(
      (app) =>
        app.metadata?.namespace === confirmedNamespace && app.metadata.name === confirmedAppName,
    );
  }, [allBrokerApps, appsLoaded, confirmedNamespace, confirmedAppName]);

  const filteredTargetAddresses = React.useMemo(
    () =>
      (targetApp?.spec.addresses ?? [])
        .map((a) => a.address)
        .filter(Boolean)
        .filter((addr) => addr.toLowerCase().includes(localAddress.toLowerCase()))
        .sort(),
    [targetApp, localAddress],
  );

  const ownerDeclared = isExternal
    ? targetApp?.spec.addresses?.find((a) => a.address === localAddress)
    : undefined;
  const effectivePubSub = ownerDeclared ? !!ownerDeclared.pubSub : localPubSub;

  const localAddresses = state.addresses.map((e, i) =>
    i === index ? { ...e, address: localAddress } : e,
  );
  const requiredErrors = validateAddressEntries(localAddresses);
  const duplicateErrors = validateDuplicateAddressEntries(localAddresses);
  const modalErrors = requiredErrors.map((e, i) => e ?? duplicateErrors[i]);
  const errorMessage = nameTouched ? modalErrors[index] : undefined;
  const requiredError = nameTouched ? requiredErrors[index] : undefined;

  const noDirection = !localProduces && !localConsumes;
  const directionError =
    noDirection && isExternal
      ? 'At least one direction is required for external addresses'
      : undefined;
  const directionWarning =
    noDirection && !isExternal
      ? 'Without a direction this owned address will only reserve the name on the broker'
      : undefined;
  const subscriptionError =
    effectivePubSub && localConsumes && !localSubscriptions.length
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
  const producerSelectorError = producerSelectorTouched
    ? validateCelExpression(localProducerSelector)
    : null;
  const consumerSelectorError = consumerSelectorTouched
    ? validateCelExpression(localConsumerSelector)
    : null;
  const duplicateError = duplicateErrors[index];
  const isModalValid =
    !requiredError &&
    !duplicateError &&
    !directionError &&
    !subscriptionError &&
    !hasPartialRef &&
    !validateCelExpression(localProducerSelector) &&
    !validateCelExpression(localConsumerSelector);

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
        pubSub: effectivePubSub,
        subscriptions: localSubscriptions,
        appName: isExternal ? localAppName.trim() || undefined : undefined,
        appNamespace: isExternal ? localAppNamespace.trim() || undefined : undefined,
        producerOfAppSelector: !isExternal ? localProducerSelector.trim() || undefined : undefined,
        consumerOfAppSelector: !isExternal ? localConsumerSelector.trim() || undefined : undefined,
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
              label={t('Ownership')}
              fieldId={`address-ownership-${String(index)}`}
              labelHelp={
                <FieldLabelHelp
                  ariaLabel={t('More info for Ownership field')}
                  tooltip={t(
                    'Owned addresses are provisioned by this app. External addresses reference addresses from another app.',
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
          </StackItem>

          {isExternal && (
            <StackItem>
              <Split hasGutter>
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
                    <TypeaheadSelect
                      id={`address-app-namespace-${String(index)}`}
                      value={localAppNamespace}
                      onChange={(val) => {
                        setLocalAppNamespace(val);
                        setLocalAppName('');
                        setConfirmedAppName('');
                        if (!val.trim()) setConfirmedNamespace('');
                      }}
                      onSelect={(ns) => {
                        setLocalAppNamespace(ns);
                        setConfirmedNamespace(ns);
                        setLocalAppName('');
                        setConfirmedAppName('');
                        setAppNamespaceTouched(true);
                      }}
                      onClose={() => {
                        setAppNamespaceTouched(true);
                        if (localAppNamespace.trim()) {
                          setConfirmedNamespace(localAppNamespace.trim());
                        }
                      }}
                      options={filteredNamespaces}
                      placeholder={t('Select a namespace')}
                      ariaLabel={t('App namespace')}
                      allowCreate
                      emptyText={appsLoaded ? t('No matching namespaces found') : t('Loading...')}
                      error={appNamespaceError}
                      dataTest={`address-app-namespace-select-${String(index)}`}
                    />
                  </FormGroup>
                </SplitItem>
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
                    <TypeaheadSelect
                      id={`address-app-name-${String(index)}`}
                      value={localAppName}
                      onChange={(val) => {
                        setLocalAppName(val);
                        if (!val.trim()) setConfirmedAppName('');
                      }}
                      onSelect={(name) => {
                        setLocalAppName(name);
                        setConfirmedAppName(name);
                        setAppNameTouched(true);
                      }}
                      onClose={() => {
                        setAppNameTouched(true);
                        if (localAppName.trim()) {
                          setConfirmedAppName(localAppName.trim());
                        }
                      }}
                      options={filteredApps}
                      placeholder={
                        localAppNamespace ? t('Select a BrokerApp') : t('Select a namespace first')
                      }
                      ariaLabel={t('App name')}
                      allowCreate
                      emptyText={
                        appsError
                          ? t('Error loading BrokerApps')
                          : appsLoaded
                            ? t('No matching BrokerApps found')
                            : t('Loading...')
                      }
                      error={appNameError}
                      isDisabled={!localAppNamespace.trim()}
                      dataTest={`address-app-name-select-${String(index)}`}
                    />
                  </FormGroup>
                </SplitItem>
              </Split>
            </StackItem>
          )}

          <StackItem>
            <FormGroup
              label={t('Address')}
              isRequired
              fieldId={`address-name-${String(index)}`}
              labelHelp={
                <FieldLabelHelp
                  ariaLabel={t('More info for Address field')}
                  tooltip={t(
                    'The name used to route messages on the broker. Owned addresses are provisioned with a lifecycle tied to this app.',
                  )}
                />
              }
            >
              {isExternal ? (
                <TypeaheadSelect
                  id={`address-name-${String(index)}`}
                  value={localAddress}
                  onChange={(val) => {
                    setLocalAddress(val);
                  }}
                  onSelect={(addr) => {
                    setLocalAddress(addr);
                    setNameTouched(true);
                    // The owner decides the routing: referencing its address with the other
                    // semantics would get the app rejected by the operator.
                    const declared = targetApp?.spec.addresses?.find((a) => a.address === addr);
                    if (declared) setLocalPubSub(!!declared.pubSub);
                  }}
                  onClose={() => {
                    setNameTouched(true);
                  }}
                  options={filteredTargetAddresses}
                  placeholder={t('e.g., orders.created')}
                  ariaLabel={t('Address')}
                  allowCreate
                  emptyText={confirmedAppName ? t('No addresses found') : t('Select an app first')}
                  error={errorMessage}
                  dataTest={`address-name-input-${String(index)}`}
                />
              ) : (
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
              )}
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
                style={directionError || directionWarning ? undefined : { visibility: 'hidden' }}
              >
                <HelperText>
                  <HelperTextItem variant={directionError ? 'error' : 'warning'}>
                    {t(
                      directionError ??
                        directionWarning ??
                        'Without a direction this owned address will only reserve the name on the broker',
                    )}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>

          <StackItem>
            <Split hasGutter>
              <SplitItem>
                <Switch
                  id={`address-pubsub-${String(index)}`}
                  label={effectivePubSub ? t('Publish / Subscribe') : t('Point-to-Point')}
                  isChecked={effectivePubSub}
                  isDisabled={!!ownerDeclared}
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

          {effectivePubSub && isExternal && !localConsumes && (
            <StackItem>
              <HelperText>
                <HelperTextItem
                  variant="indeterminate"
                  data-test={`address-no-subscriptions-${String(index)}`}
                >
                  {t(
                    'Subscriptions are only available when consuming an external address. Check Consumes to subscribe.',
                  )}
                </HelperTextItem>
              </HelperText>
            </StackItem>
          )}

          {effectivePubSub && (!isExternal || localConsumes) && (
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

          {!isExternal && (
            <>
              <StackItem>
                <FormGroup
                  label={t('Producer app selector')}
                  fieldId={`address-producer-selector-${String(index)}`}
                  labelHelp={
                    <FieldLabelHelp
                      ariaLabel={t('More info for Producer app selector field')}
                      tooltip={t(
                        'CEL expression that selects which other apps may produce to this address. When empty, no other apps may reference this address as a producer.',
                      )}
                    />
                  }
                >
                  <TextInput
                    id={`address-producer-selector-${String(index)}`}
                    value={localProducerSelector}
                    onChange={(_e, val) => {
                      setLocalProducerSelector(val);
                    }}
                    onBlur={() => {
                      setProducerSelectorTouched(true);
                    }}
                    placeholder={t("e.g., app.metadata.name == 'order-processor'")}
                    validated={producerSelectorError ? 'error' : 'default'}
                    data-test={`address-producer-selector-${String(index)}`}
                  />
                  {producerSelectorError && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">{t(producerSelectorError)}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </StackItem>
              <StackItem>
                <FormGroup
                  label={t('Consumer app selector')}
                  fieldId={`address-consumer-selector-${String(index)}`}
                  labelHelp={
                    <FieldLabelHelp
                      ariaLabel={t('More info for Consumer app selector field')}
                      tooltip={t(
                        'CEL expression that selects which other apps may consume from this address. When empty, no other apps may reference this address as a consumer.',
                      )}
                    />
                  }
                >
                  <TextInput
                    id={`address-consumer-selector-${String(index)}`}
                    value={localConsumerSelector}
                    onChange={(_e, val) => {
                      setLocalConsumerSelector(val);
                    }}
                    onBlur={() => {
                      setConsumerSelectorTouched(true);
                    }}
                    placeholder={t("e.g., app.metadata.namespace == 'team-b'")}
                    validated={consumerSelectorError ? 'error' : 'default'}
                    data-test={`address-consumer-selector-${String(index)}`}
                  />
                  {consumerSelectorError && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">{t(consumerSelectorError)}</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </StackItem>
            </>
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
