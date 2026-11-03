import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { AddressRef, AddressSpec, BrokerAppCR, BrokerAppSpec } from '../../k8s/types';
import { compileGate, type GatePrincipal } from '../../dataflow/gates';
import { validateBrokerAppCR } from '../../validation/k8s';

export interface MatchLabel {
  id: string;
  key: string;
  value: string;
}

/**
 * `owned`: the address lives in `spec.addresses`, its lifecycle follows this app and
 * the app decides, per role, who else may use it through a gate.
 * `referenced`: another app owns the address; this app only declares a capability on
 * it and must be admitted by the owner's gate.
 */
export type AddressKind = 'owned' | 'referenced';
export type AddressDirection = 'produces' | 'consumes' | 'both' | 'none';
export type GateRole = 'producer' | 'consumer';

export interface Address {
  address: string;
  kind: AddressKind;
  direction: AddressDirection;
  pubSub?: boolean;
  subscriptions?: string[];
  /** Owned only: raw CEL of `producerOfAppSelector`, exactly as stored in the CR. */
  producerGate?: string;
  /** Owned only: raw CEL of `consumerOfAppSelector`, exactly as stored in the CR. */
  consumerGate?: string;
  /** Referenced only: name of the BrokerApp that owns this address. */
  appName?: string;
  /** Referenced only: namespace of the BrokerApp that owns this address. */
  appNamespace?: string;
}

export interface BrokerAppFormState {
  cr: BrokerAppCR;
  matchLabels: MatchLabel[];
  addresses: Address[];
  hasChanges: boolean;
}

export type BrokerAppFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_ADDRESS' }
  | { type: 'REMOVE_ADDRESS'; payload: { index: number } }
  | {
      type: 'UPDATE_ADDRESS';
      payload: { index: number } & Partial<
        Pick<
          Address,
          | 'address'
          | 'kind'
          | 'direction'
          | 'pubSub'
          | 'subscriptions'
          | 'producerGate'
          | 'consumerGate'
          | 'appName'
          | 'appNamespace'
        >
      >;
    }
  /**
   * Opens one gate of an owned address to the given parties. The reducer writes the
   * canonical CEL so the form never has to know the expression syntax; an empty
   * list closes the gate.
   */
  | {
      type: 'SET_ADDRESS_GATE';
      payload: { index: number; role: GateRole; principals: GatePrincipal[] };
    }
  | { type: 'ADD_MATCH_LABEL' }
  | { type: 'REMOVE_MATCH_LABEL'; payload: string }
  | { type: 'UPDATE_MATCH_LABEL'; payload: { id: string; key: string; value: string } }
  /**
   * Merges selected BrokerService labels into the serviceSelector matchLabels.
   * Keys that already exist in the form are skipped so existing choices are preserved.
   */
  | { type: 'COPY_MATCH_LABELS_FROM_SERVICE'; payload: Record<string, string> }
  | {
      type: 'SET_MODEL';
      payload: BrokerAppCR;
      yaml?: string;
      preserveLabels?: boolean;
      resetChanges?: boolean;
    }
  | { type: 'SET_CPU_REQUEST'; payload: string }
  | { type: 'SET_CPU_LIMIT'; payload: string }
  | { type: 'SET_MEMORY_REQUEST'; payload: string }
  | { type: 'SET_MEMORY_LIMIT'; payload: string };

// --- CR sync ---

// First occurrence wins so duplicate form rows do not overwrite YAML preview values.
const syncServiceSelectorFromLabels = (cr: BrokerAppCR, labels: MatchLabel[]): void => {
  const result: Record<string, string> = {};
  labels.forEach(({ key, value }) => {
    if (key && !(key in result)) {
      result[key] = value;
    }
  });
  cr.spec.serviceSelector = Object.keys(result).length ? { matchLabels: result } : {};
};

const cleanupResources = (spec: BrokerAppSpec): void => {
  if (spec.resources?.limits && !Object.keys(spec.resources.limits).length) {
    delete spec.resources.limits;
  }
  if (spec.resources?.requests && !Object.keys(spec.resources.requests).length) {
    delete spec.resources.requests;
  }
  if (spec.resources && !Object.keys(spec.resources).length) {
    delete spec.resources;
  }
};

/**
 * Maps the address list to the two CRD spec fields: owned addresses become
 * `spec.addresses` entries carrying their gates, and every address with a direction
 * becomes a `spec.capabilities` entry, with the owner tuple when referenced.
 */
const syncAddressesToCR = (cr: BrokerAppCR, addresses: Address[]): void => {
  const toAddressSpec = (e: Address): AddressSpec => {
    const spec: AddressSpec = { address: e.address.trim() };
    if (e.pubSub) spec.pubSub = e.pubSub;
    if (e.subscriptions?.length) spec.subscriptions = [...e.subscriptions];
    if (e.producerGate?.trim()) spec.producerOfAppSelector = e.producerGate.trim();
    if (e.consumerGate?.trim()) spec.consumerOfAppSelector = e.consumerGate.trim();
    return spec;
  };

  const validAddresses = addresses.filter((e) => e.address.trim());

  const ownedEntries = validAddresses.filter((e) => e.kind === 'owned').map(toAddressSpec);

  const toCapabilityEntry = (e: Address, isConsumer: boolean): AddressRef => {
    const entry: AddressRef = { address: e.address.trim() };
    if (e.kind === 'referenced') {
      if (e.appName) entry.appName = e.appName;
      if (e.appNamespace) entry.appNamespace = e.appNamespace;
    }
    if (!isConsumer && e.pubSub) entry.pubSub = e.pubSub;
    if (isConsumer && e.subscriptions?.length) entry.subscriptions = [...e.subscriptions];
    return entry;
  };

  const producerEntries = validAddresses
    .filter((e) => e.direction === 'produces' || e.direction === 'both')
    .map((e) => toCapabilityEntry(e, false));

  const consumerEntries = validAddresses
    .filter((e) => e.direction === 'consumes' || e.direction === 'both')
    .map((e) => toCapabilityEntry(e, true));

  if (ownedEntries.length) {
    cr.spec.addresses = ownedEntries;
  } else {
    delete cr.spec.addresses;
  }

  if (producerEntries.length || consumerEntries.length) {
    cr.spec.capabilities = [
      {
        ...(producerEntries.length ? { producerOf: producerEntries } : {}),
        ...(consumerEntries.length ? { consumerOf: consumerEntries } : {}),
      },
    ];
  } else {
    delete cr.spec.capabilities;
  }
};

// --- helpers ---

// Monotonically increasing counter for match label row ids, so two rows can never get the same id.
let matchLabelIdSeq = 0;
const nextMatchLabelId = (): string => `label-${(matchLabelIdSeq++).toString()}`;

const matchLabelsFromRecord = (record: Record<string, string> | undefined): MatchLabel[] => {
  if (!record || !Object.keys(record).length) {
    return [{ id: nextMatchLabelId(), key: '', value: '' }];
  }
  return Object.entries(record).map(([key, value]) => ({
    id: nextMatchLabelId(),
    key,
    value,
  }));
};

const mergeMatchLabelsWithYaml = (
  formLabels: MatchLabel[],
  yamlLabels: Record<string, string> | undefined,
): MatchLabel[] => {
  if (!yamlLabels) return formLabels;
  const existingKeys = new Set(formLabels.map(({ key }) => key).filter(Boolean));
  const merged = [...formLabels];
  Object.entries(yamlLabels).forEach(([key, value]) => {
    if (!existingKeys.has(key)) {
      merged.push({ id: nextMatchLabelId(), key, value });
      existingKeys.add(key);
    }
  });
  return merged;
};

/**
 * Reconstructs the address list from `spec.addresses` and `spec.capabilities` when
 * loading a CR from YAML or an existing resource.
 *
 * A capability entry without `appName` is the app's own address, whether or not it
 * is listed under `spec.addresses` (the operator provisions it either way), so it
 * hydrates as owned and the next sync writes it to `spec.addresses` explicitly.
 */
export const hydrateAddresses = (cr: BrokerAppCR): Address[] => {
  const addresses: Address[] = [];

  const cap = cr.spec.capabilities?.[0];
  const producerEntries = cap?.producerOf ?? [];
  const consumerEntries = cap?.consumerOf ?? [];
  const producerSet = new Set(producerEntries.map((a) => a.address));
  const consumerSet = new Set(consumerEntries.map((a) => a.address));
  const producerByAddress = new Map(producerEntries.map((e) => [e.address, e]));
  const consumerByAddress = new Map(consumerEntries.map((e) => [e.address, e]));

  const resolveDirection = (name: string): AddressDirection => {
    const isProducer = producerSet.has(name);
    const isConsumer = consumerSet.has(name);
    if (isProducer && isConsumer) return 'both';
    if (isProducer) return 'produces';
    if (isConsumer) return 'consumes';
    return 'none';
  };

  const seen = new Set<string>();

  for (const entry of cr.spec.addresses ?? []) {
    seen.add(entry.address);
    addresses.push({
      address: entry.address,
      kind: 'owned',
      direction: resolveDirection(entry.address),
      pubSub: entry.pubSub,
      subscriptions: entry.subscriptions,
      producerGate: entry.producerOfAppSelector,
      consumerGate: entry.consumerOfAppSelector,
    });
  }

  for (const capEntry of [...producerEntries, ...consumerEntries]) {
    const addr = capEntry.address;
    if (seen.has(addr)) continue;
    seen.add(addr);
    // Routing semantics live on the producer side (pubSub) or follow from the
    // consumer's subscriptions, as the operator infers them.
    const subscriptions = consumerByAddress.get(addr)?.subscriptions;
    const pubSub = !!producerByAddress.get(addr)?.pubSub || !!subscriptions?.length;
    const hydrated: Address = {
      address: addr,
      kind: capEntry.appName ? 'referenced' : 'owned',
      direction: resolveDirection(addr),
      ...(pubSub ? { pubSub } : {}),
      ...(subscriptions?.length ? { subscriptions: [...subscriptions] } : {}),
    };
    if (capEntry.appName) {
      hydrated.appName = capEntry.appName;
      hydrated.appNamespace = capEntry.appNamespace;
    }
    addresses.push(hydrated);
  }

  return addresses;
};

// --- reducer ---

export const brokerAppReducer = (
  state: BrokerAppFormState,
  action: BrokerAppFormAction,
): BrokerAppFormState => {
  let cr = { ...state.cr, spec: { ...state.cr.spec } };
  let { matchLabels, addresses } = state;

  switch (action.type) {
    case 'SET_NAME':
      cr.metadata = { ...cr.metadata, name: action.payload };
      break;

    case 'ADD_ADDRESS':
      addresses = [...addresses, { address: '', kind: 'owned', direction: 'produces' }];
      break;

    case 'REMOVE_ADDRESS':
      addresses = addresses.filter((_, i) => i !== action.payload.index);
      break;

    case 'UPDATE_ADDRESS': {
      const { index, ...changes } = action.payload;
      addresses = addresses.map((e, i) => {
        if (i !== index) return e;
        const updated = { ...e, ...changes };
        if (changes.subscriptions) {
          updated.subscriptions = [...changes.subscriptions];
        }
        // Gates belong to the owner, the owner tuple to a reference: never both.
        if (updated.kind === 'owned') {
          updated.appName = undefined;
          updated.appNamespace = undefined;
        } else {
          updated.producerGate = undefined;
          updated.consumerGate = undefined;
        }
        if (changes.pubSub === false) {
          updated.subscriptions = undefined;
        }
        // A referenced address only subscribes through consumerOf; producerOf has no
        // subscriptions field, so keeping them would show queues the CR never carries.
        if (
          updated.kind === 'referenced' &&
          updated.direction !== 'consumes' &&
          updated.direction !== 'both'
        ) {
          updated.subscriptions = undefined;
        }
        return updated;
      });
      break;
    }

    case 'SET_ADDRESS_GATE': {
      const { index, role, principals } = action.payload;
      const expression = compileGate(principals) || undefined;
      addresses = addresses.map((e, i) => {
        if (i !== index || e.kind !== 'owned') return e;
        return role === 'producer'
          ? { ...e, producerGate: expression }
          : { ...e, consumerGate: expression };
      });
      break;
    }

    case 'ADD_MATCH_LABEL':
      matchLabels = [...matchLabels, { id: nextMatchLabelId(), key: '', value: '' }];
      break;

    case 'REMOVE_MATCH_LABEL':
      matchLabels = matchLabels.filter((l) => l.id !== action.payload);
      break;

    case 'UPDATE_MATCH_LABEL':
      matchLabels = matchLabels.map((l) =>
        l.id === action.payload.id
          ? { ...l, key: action.payload.key, value: action.payload.value }
          : l,
      );
      break;

    case 'COPY_MATCH_LABELS_FROM_SERVICE': {
      const existingKeys = new Set(matchLabels.map((l) => l.key).filter(Boolean));
      const toAdd = Object.entries(action.payload).filter(
        ([key]) => Boolean(key) && !existingKeys.has(key),
      );
      const nonEmptyRows = matchLabels.filter((l) => l.key || l.value);
      matchLabels = [
        ...nonEmptyRows,
        ...toAdd.map(([key, value]) => ({ id: nextMatchLabelId(), key, value })),
      ];
      if (matchLabels.length === 0) {
        matchLabels = [{ id: nextMatchLabelId(), key: '', value: '' }];
      }
      break;
    }

    case 'SET_MODEL': {
      if (action.yaml) {
        const error = validateBrokerAppCR(action.payload, action.yaml);
        if (error) return state;
      }
      // YAML-parsed CRs may lack serviceSelector at runtime despite the required type
      const rawSpec = action.payload.spec as Partial<BrokerAppSpec>;
      cr = { ...action.payload, spec: { serviceSelector: {}, ...rawSpec } };
      matchLabels = action.preserveLabels
        ? mergeMatchLabelsWithYaml(matchLabels, cr.spec.serviceSelector.matchLabels)
        : matchLabelsFromRecord(cr.spec.serviceSelector.matchLabels);
      addresses = hydrateAddresses(cr);
      syncServiceSelectorFromLabels(cr, matchLabels);
      syncAddressesToCR(cr, addresses);
      return {
        ...state,
        cr,
        matchLabels,
        addresses,
        hasChanges: !action.resetChanges,
      };
    }

    case 'SET_CPU_REQUEST':
      if (action.payload) {
        cr.spec.resources = {
          ...cr.spec.resources,
          requests: { ...cr.spec.resources?.requests, cpu: action.payload },
        };
      } else {
        delete cr.spec.resources?.requests?.cpu;
        cleanupResources(cr.spec);
      }
      break;

    case 'SET_CPU_LIMIT':
      if (action.payload) {
        cr.spec.resources = {
          ...cr.spec.resources,
          limits: { ...cr.spec.resources?.limits, cpu: action.payload },
        };
      } else {
        delete cr.spec.resources?.limits?.cpu;
        cleanupResources(cr.spec);
      }
      break;

    case 'SET_MEMORY_REQUEST':
      if (action.payload) {
        cr.spec.resources = {
          ...cr.spec.resources,
          requests: { ...cr.spec.resources?.requests, memory: action.payload },
        };
      } else {
        delete cr.spec.resources?.requests?.memory;
        cleanupResources(cr.spec);
      }
      break;

    case 'SET_MEMORY_LIMIT':
      if (action.payload) {
        cr.spec.resources = {
          ...cr.spec.resources,
          limits: { ...cr.spec.resources?.limits, memory: action.payload },
        };
      } else {
        delete cr.spec.resources?.limits?.memory;
        cleanupResources(cr.spec);
      }
      break;

    default:
      return state;
  }

  syncServiceSelectorFromLabels(cr, matchLabels);
  syncAddressesToCR(cr, addresses);
  return { ...state, cr, matchLabels, addresses, hasChanges: true };
};

export const createInitialBrokerAppState = (namespace: string): BrokerAppFormState => ({
  cr: {
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'my-messaging-app', namespace },
    spec: { serviceSelector: {} },
  },
  matchLabels: [{ id: nextMatchLabelId(), key: '', value: '' }],
  addresses: [],
  hasChanges: false,
});

export const BrokerAppFormStateContext = createContext<BrokerAppFormState | undefined>(undefined);
export const BrokerAppFormDispatchContext = createContext<
  Dispatch<BrokerAppFormAction> | undefined
>(undefined);

/**
 * Reads the current BrokerApp form state from context.
 * Must be used inside a BrokerAppFormStateContext.Provider.
 */
export const useBrokerAppFormState = (): BrokerAppFormState => {
  const ctx = useContext(BrokerAppFormStateContext);
  if (!ctx)
    throw new Error('useBrokerAppFormState must be used inside BrokerAppFormStateContext.Provider');
  return ctx;
};

/**
 * Reads the dispatch function for BrokerApp form actions from context.
 * Must be used inside a BrokerAppFormDispatchContext.Provider.
 */
export const useBrokerAppFormDispatch = (): Dispatch<BrokerAppFormAction> => {
  const ctx = useContext(BrokerAppFormDispatchContext);
  if (!ctx)
    throw new Error(
      'useBrokerAppFormDispatch must be used inside BrokerAppFormDispatchContext.Provider',
    );
  return ctx;
};
