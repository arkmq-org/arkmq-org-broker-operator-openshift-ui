import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Button,
  Checkbox,
  FormGroup,
  FormHelperText,
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
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import type { AddressKind, AddressDirection } from '../../../reducers/brokerapp/reducer';
import { evaluateGateFor, type GateVerdict } from '../../../dataflow/gates';
import { useGateUniverse } from '../../../dataflow/useGateUniverse';
import { TypeaheadSelect } from '../../../shared-components/TypeaheadSelect';
import {
  validateAddressEntries,
  validateCelExpression,
  validateDuplicateAddressEntries,
} from '../../../validation/k8s';
import { GateEditor, gateSettingFrom, type GateSetting } from './GateEditor';

import './AddressEditForm.css';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__address-manager';

const KIND_OPTIONS: AddressKind[] = ['owned', 'referenced'];

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

/** The gate a referenced address must pass, as the owner declares it for one role. */
const ownerGateFor = (
  owner: { producerOfAppSelector?: string; consumerOfAppSelector?: string } | undefined,
  role: 'producer' | 'consumer',
): string | undefined =>
  role === 'producer' ? owner?.producerOfAppSelector : owner?.consumerOfAppSelector;

/**
 * Edits a single address entry, in the diagram's side panel. All fields are buffered
 * in local state and only dispatched to the reducer when Done is clicked; Cancel
 * discards the changes and Remove drops the entry.
 *
 * Owned addresses expose two gate editors (who may produce, who may consume); the
 * reducer compiles list gates to CEL on save, custom expressions are stored verbatim.
 * Referenced addresses pick an owner app and are told whether its gate admits this app.
 */
export const AddressEditForm: React.FC<{
  index: number;
  onSave: () => void;
  onCancel: () => void;
  /** Absent for a brand-new entry, which Cancel already discards. */
  onRemove?: () => void;
}> = ({ index, onSave, onCancel, onRemove }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const entry = state.addresses[index];
  const thisApp = {
    namespace: state.cr.metadata?.namespace ?? '',
    name: state.cr.metadata?.name ?? '',
  };

  const { universe, apps: allBrokerApps, appsLoaded, appsError } = useGateUniverse();

  const [localAddress, setLocalAddress] = useState(entry.address);
  const [localKind, setLocalKind] = useState<AddressKind>(entry.kind);
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
  // Gates are interpreted once, when the modal opens: generated gates carry their own
  // candidates as literals, so a universe that is still loading cannot change the answer.
  const [producerGate, setProducerGate] = useState<GateSetting>(() =>
    gateSettingFrom(entry.producerGate, universe),
  );
  const [consumerGate, setConsumerGate] = useState<GateSetting>(() =>
    gateSettingFrom(entry.consumerGate, universe),
  );

  const [nameTouched, setNameTouched] = useState(false);
  const [appNameTouched, setAppNameTouched] = useState(false);
  const [appNamespaceTouched, setAppNamespaceTouched] = useState(false);

  const isReferenced = localKind === 'referenced';

  const filteredNamespaces = React.useMemo(
    (): string[] =>
      universe.namespaces.filter((ns) =>
        ns.toLowerCase().includes(localAppNamespace.toLowerCase()),
      ),
    [universe.namespaces, localAppNamespace],
  );

  const filteredApps = React.useMemo(() => {
    if (!confirmedNamespace) return [];
    return (universe.appsByNamespace[confirmedNamespace] ?? [])
      .filter((name) => name !== thisApp.name || confirmedNamespace !== thisApp.namespace)
      .filter((name) => name.toLowerCase().includes(localAppName.toLowerCase()));
  }, [universe.appsByNamespace, confirmedNamespace, localAppName, thisApp.name, thisApp.namespace]);

  // The BrokerApp owning the referenced address, once its namespace and name are confirmed.
  const targetApp = React.useMemo(() => {
    if (!confirmedAppName || !confirmedNamespace || !appsLoaded) return undefined;
    return allBrokerApps.find(
      (app) =>
        app.metadata?.namespace === confirmedNamespace && app.metadata.name === confirmedAppName,
    );
  }, [allBrokerApps, appsLoaded, confirmedNamespace, confirmedAppName]);

  // Only addresses the owner opened in some role can be referenced at all.
  const ownerSharedAddresses = React.useMemo(
    () =>
      (targetApp?.spec.addresses ?? [])
        .filter((a) => Boolean(a.producerOfAppSelector) || Boolean(a.consumerOfAppSelector))
        .map((a) => a.address)
        .filter(Boolean)
        .filter((addr) => addr.toLowerCase().includes(localAddress.toLowerCase()))
        .sort(),
    [targetApp, localAddress],
  );

  // The operator rejects mixed semantics; when the owner declares this address, lock to its routing.
  const ownerDeclared = isReferenced
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

  const noDirection = !localProduces && !localConsumes;
  const directionError =
    noDirection && isReferenced
      ? t('At least one direction is required for referenced addresses')
      : undefined;
  const directionWarning =
    noDirection && !isReferenced
      ? t(
          'Without a direction this address only reserves the name on the broker for the apps its gates admit',
        )
      : undefined;
  const subscriptionError =
    effectivePubSub && localConsumes && !localSubscriptions.length
      ? 'At least one subscription is required for pub/sub consumers'
      : undefined;
  const hasPartialRef =
    isReferenced &&
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
  const gateError =
    !isReferenced &&
    [producerGate, consumerGate].some(
      (gate) => gate.mode === 'custom' && validateCelExpression(gate.expression) !== null,
    );
  const isModalValid =
    !requiredErrors[index] &&
    !duplicateError &&
    !directionError &&
    !subscriptionError &&
    !hasPartialRef &&
    !gateError;

  // What the owner's gates say about this app, per requested role.
  const verdicts: { role: 'producer' | 'consumer'; verdict: GateVerdict }[] =
    isReferenced && ownerDeclared && thisApp.name
      ? [
          ...(localProduces
            ? [
                {
                  role: 'producer' as const,
                  verdict: evaluateGateFor(ownerGateFor(ownerDeclared, 'producer'), thisApp),
                },
              ]
            : []),
          ...(localConsumes
            ? [
                {
                  role: 'consumer' as const,
                  verdict: evaluateGateFor(ownerGateFor(ownerDeclared, 'consumer'), thisApp),
                },
              ]
            : []),
        ]
      : [];

  const verdictText = (role: 'producer' | 'consumer', verdict: GateVerdict): string => {
    if (verdict === 'unknown') {
      return role === 'producer'
        ? t('The owner gates producers with an expression this form cannot evaluate')
        : t('The owner gates consumers with an expression this form cannot evaluate');
    }
    if (verdict) {
      return role === 'producer'
        ? t('The owner admits this app as a producer')
        : t('The owner admits this app as a consumer');
    }
    return role === 'producer'
      ? t('The owner does not admit this app as a producer; the operator will reject it')
      : t('The owner does not admit this app as a consumer; the operator will reject it');
  };

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
        kind: localKind,
        direction: resolvedDirection,
        pubSub: effectivePubSub,
        subscriptions: localSubscriptions,
        appName: isReferenced ? localAppName.trim() || undefined : undefined,
        appNamespace: isReferenced ? localAppNamespace.trim() || undefined : undefined,
        producerGate:
          !isReferenced && producerGate.mode === 'custom'
            ? producerGate.expression.trim() || undefined
            : undefined,
        consumerGate:
          !isReferenced && consumerGate.mode === 'custom'
            ? consumerGate.expression.trim() || undefined
            : undefined,
      },
    });
    if (!isReferenced && producerGate.mode === 'principals') {
      dispatch({
        type: 'SET_ADDRESS_GATE',
        payload: { index, role: 'producer', principals: producerGate.principals },
      });
    }
    if (!isReferenced && consumerGate.mode === 'principals') {
      dispatch({
        type: 'SET_ADDRESS_GATE',
        payload: { index, role: 'consumer', principals: consumerGate.principals },
      });
    }

    onSave();
  };

  return (
    <div data-test="address-edit-form">
      <Stack hasGutter>
        <StackItem>
          <FormGroup
            label={t('Kind')}
            fieldId={`address-kind-${String(index)}`}
            labelHelp={
              <FieldLabelHelp
                ariaLabel={t('More info for Kind field')}
                tooltip={t(
                  'Owned addresses are provisioned with this app and stay private unless a gate opens them to other apps. Referenced addresses belong to another app whose gate must admit this one.',
                )}
              />
            }
          >
            <ToggleGroup data-test={`address-kind-${String(index)}`}>
              {KIND_OPTIONS.map((kind) => (
                <ToggleGroupItem
                  key={kind}
                  text={kind === 'owned' ? t('Owned') : t('Referenced')}
                  isSelected={localKind === kind}
                  onChange={() => {
                    setLocalKind(kind);
                  }}
                  data-test={`address-kind-${kind}-${String(index)}`}
                />
              ))}
            </ToggleGroup>
          </FormGroup>
        </StackItem>

        {isReferenced && (
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
            {isReferenced ? (
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
                options={ownerSharedAddresses}
                placeholder={t('e.g., orders.created')}
                ariaLabel={t('Address')}
                allowCreate
                emptyText={
                  confirmedAppName ? t('No shared addresses found') : t('Select an app first')
                }
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
            {verdicts.length > 0 && (
              <FormHelperText>
                <HelperText>
                  {verdicts.map(({ role, verdict }) => (
                    <HelperTextItem
                      key={role}
                      variant={
                        verdict === 'unknown' ? 'indeterminate' : verdict ? 'success' : 'warning'
                      }
                      data-test={`address-gate-verdict-${role}-${String(index)}`}
                    >
                      {verdictText(role, verdict)}
                    </HelperTextItem>
                  ))}
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
                  {directionError ??
                    directionWarning ??
                    t(
                      'Without a direction this address only reserves the name on the broker for the apps its gates admit',
                    )}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        </StackItem>

        {!isReferenced && (
          <StackItem>
            <GateEditor
              id={`address-producer-gate-${String(index)}`}
              label={t('Who may produce')}
              helpText={t(
                'Other apps allowed to send to this address. Each party is a namespace, or one app inside a namespace. Without any, only this app produces.',
              )}
              value={producerGate}
              onChange={setProducerGate}
              universe={universe}
              universeLoaded={appsLoaded}
            />
          </StackItem>
        )}

        {!isReferenced && (
          <StackItem>
            <GateEditor
              id={`address-consumer-gate-${String(index)}`}
              label={t('Who may consume')}
              helpText={t(
                'Other apps allowed to receive from this address. Each party is a namespace, or one app inside a namespace. Without any, only this app consumes.',
              )}
              value={consumerGate}
              onChange={setConsumerGate}
              universe={universe}
              universeLoaded={appsLoaded}
            />
          </StackItem>
        )}

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

        {effectivePubSub && isReferenced && !localConsumes && (
          <StackItem>
            <HelperText>
              <HelperTextItem
                variant="indeterminate"
                data-test={`address-no-subscriptions-${String(index)}`}
              >
                {t(
                  'Subscriptions are only available when consuming a referenced address. Check Consumes to subscribe.',
                )}
              </HelperTextItem>
            </HelperText>
          </StackItem>
        )}

        {effectivePubSub && (!isReferenced || localConsumes) && (
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
        <StackItem>
          <ActionList>
            <ActionListGroup>
              <ActionListItem>
                <Button
                  variant="primary"
                  onClick={handleDone}
                  isDisabled={!isModalValid}
                  data-test="modal-done-btn"
                >
                  {t('Done')}
                </Button>
              </ActionListItem>
              <ActionListItem>
                <Button variant="link" onClick={onCancel} data-test="modal-cancel-btn">
                  {t('Cancel')}
                </Button>
              </ActionListItem>
            </ActionListGroup>
            {onRemove && (
              <ActionListGroup>
                <ActionListItem>
                  <Button variant="danger" onClick={onRemove} data-test="remove-address-btn">
                    {t('Remove address')}
                  </Button>
                </ActionListItem>
              </ActionListGroup>
            )}
          </ActionList>
        </StackItem>
      </Stack>
    </div>
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
