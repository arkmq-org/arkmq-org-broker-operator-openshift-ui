import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { BrokerAppCR, BrokerAppSpec, MatchAddress, PrivateAddress } from '../../k8s/types';
import { validateBrokerAppCR } from '../../validation/k8s';

export interface MatchLabel {
  id: string;
  key: string;
  value: string;
}

export type AddressOwnership = 'private' | 'shared' | 'external';
export type AddressDirection = 'produces' | 'consumes' | 'both' | 'none';

export interface Address {
  address: string;
  ownership: AddressOwnership;
  direction: AddressDirection;
  pubSub?: boolean;
  subscriptions?: string[];
  /** Name of the remote BrokerApp that owns this address (external only). */
  appName?: string;
  /** Namespace of the remote BrokerApp that owns this address (external only). */
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
          | 'ownership'
          | 'direction'
          | 'pubSub'
          | 'subscriptions'
          | 'appName'
          | 'appNamespace'
        >
      >;
    }
  | { type: 'ADD_MATCH_LABEL' }
  | { type: 'REMOVE_MATCH_LABEL'; payload: string }
  | { type: 'UPDATE_MATCH_LABEL'; payload: { id: string; key: string; value: string } }
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
const syncSelectorFromLabels = (cr: BrokerAppCR, labels: MatchLabel[]): void => {
  const result: Record<string, string> = {};
  labels.forEach(({ key, value }) => {
    if (key && !(key in result)) {
      result[key] = value;
    }
  });
  if (Object.keys(result).length) {
    cr.spec.selector = { matchLabels: result };
  } else {
    delete cr.spec.selector;
  }
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
 * Maps the address list to the three CRD spec fields:
 * spec.addresses, spec.sharedAddresses, and spec.capabilities.
 */
const syncAddressesToCR = (cr: BrokerAppCR, addresses: Address[]): void => {
  const cleanAddress = (e: Address): PrivateAddress => {
    const cleaned: PrivateAddress = { address: e.address.trim() };
    if (e.pubSub) cleaned.pubSub = e.pubSub;
    if (e.subscriptions?.length) cleaned.subscriptions = [...e.subscriptions];
    return cleaned;
  };

  const validAddresses = addresses.filter((e) => e.address.trim());

  const privateEntries = validAddresses.filter((e) => e.ownership === 'private').map(cleanAddress);

  const sharedEntries = validAddresses.filter((e) => e.ownership === 'shared').map(cleanAddress);

  const toCapabilityEntry = (e: Address, isConsumer: boolean): MatchAddress => {
    const entry: MatchAddress = { address: e.address.trim() };
    if (e.appName) entry.appName = e.appName;
    if (e.appNamespace) entry.appNamespace = e.appNamespace;
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

  if (privateEntries.length) {
    cr.spec.addresses = privateEntries;
  } else {
    delete cr.spec.addresses;
  }

  if (sharedEntries.length) {
    cr.spec.sharedAddresses = sharedEntries;
  } else {
    delete cr.spec.sharedAddresses;
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

const matchLabelsFromRecord = (record: Record<string, string> | undefined): MatchLabel[] => {
  if (!record || !Object.keys(record).length) {
    return [{ id: String(Date.now()), key: '', value: '' }];
  }
  return Object.entries(record).map(([key, value], i) => ({
    id: `imported-${String(i)}-${String(Date.now())}`,
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
      merged.push({ id: String(Date.now()), key, value });
      existingKeys.add(key);
    }
  });
  return merged;
};

/**
 * Reconstructs the address list from the three CRD spec fields
 * when loading a CR from YAML or an existing resource.
 */
const hydrateAddresses = (cr: BrokerAppCR): Address[] => {
  const addresses: Address[] = [];

  const cap = cr.spec.capabilities?.[0];
  const producerEntries = cap?.producerOf ?? [];
  const consumerEntries = cap?.consumerOf ?? [];
  const producerNames: string[] = producerEntries.map((a) => a.address);
  const consumerNames: string[] = consumerEntries.map((a) => a.address);
  const producerSet = new Set(producerNames);
  const consumerSet = new Set(consumerNames);

  const capabilityByAddress = new Map<string, MatchAddress>();
  for (const entry of [...producerEntries, ...consumerEntries]) {
    if (!capabilityByAddress.has(entry.address)) {
      capabilityByAddress.set(entry.address, entry);
    }
  }

  const resolveDirection = (name: string): AddressDirection => {
    const isProducer = producerSet.has(name);
    const isConsumer = consumerSet.has(name);
    if (isProducer && isConsumer) return 'both';
    if (isProducer) return 'produces';
    if (isConsumer) return 'consumes';
    return 'none';
  };

  const ownedAddressNames = new Set<string>();

  for (const entry of cr.spec.addresses ?? []) {
    ownedAddressNames.add(entry.address);
    addresses.push({
      address: entry.address,
      ownership: 'private',
      direction: resolveDirection(entry.address),
      pubSub: entry.pubSub,
      subscriptions: entry.subscriptions,
    });
  }

  for (const entry of cr.spec.sharedAddresses ?? []) {
    ownedAddressNames.add(entry.address);
    addresses.push({
      address: entry.address,
      ownership: 'shared',
      direction: resolveDirection(entry.address),
      pubSub: entry.pubSub,
      subscriptions: entry.subscriptions,
    });
  }

  const seenCapability = new Set<string>();
  for (const addr of [...producerNames, ...consumerNames]) {
    if (!seenCapability.has(addr) && !ownedAddressNames.has(addr)) {
      const capEntry = capabilityByAddress.get(addr);
      addresses.push({
        address: addr,
        ownership: 'external',
        direction: resolveDirection(addr),
        appName: capEntry?.appName,
        appNamespace: capEntry?.appNamespace,
      });
    }
    seenCapability.add(addr);
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
      addresses = [...addresses, { address: '', ownership: 'private', direction: 'produces' }];
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
        if (changes.ownership === 'external') {
          updated.pubSub = undefined;
          updated.subscriptions = undefined;
        }
        if (changes.ownership && changes.ownership !== 'external') {
          updated.appName = undefined;
          updated.appNamespace = undefined;
        }
        if (changes.pubSub === false) {
          updated.subscriptions = undefined;
        }
        return updated;
      });
      break;
    }

    case 'ADD_MATCH_LABEL':
      matchLabels = [...matchLabels, { id: String(Date.now()), key: '', value: '' }];
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

    case 'SET_MODEL': {
      if (action.yaml) {
        const error = validateBrokerAppCR(action.payload, action.yaml);
        if (error) return state;
      }
      cr = { ...action.payload, spec: { ...action.payload.spec } };
      matchLabels = action.preserveLabels
        ? mergeMatchLabelsWithYaml(matchLabels, cr.spec.selector?.matchLabels)
        : matchLabelsFromRecord(cr.spec.selector?.matchLabels);
      addresses = hydrateAddresses(cr);
      syncSelectorFromLabels(cr, matchLabels);
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

  syncSelectorFromLabels(cr, matchLabels);
  syncAddressesToCR(cr, addresses);
  return { ...state, cr, matchLabels, addresses, hasChanges: true };
};

export const createInitialBrokerAppState = (namespace: string): BrokerAppFormState => ({
  cr: {
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'my-messaging-app', namespace },
    spec: {},
  },
  matchLabels: [{ id: String(Date.now()), key: '', value: '' }],
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
