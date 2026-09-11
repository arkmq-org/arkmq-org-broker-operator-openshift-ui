import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { BrokerAppCR, PrivateAddress } from '../../k8s/types';

export interface MatchLabel {
  id: string;
  key: string;
  value: string;
}

export type AddressOwnership = 'private' | 'shared' | 'external';
export type AddressDirection = 'produces' | 'consumes' | 'both';

/**
 * Form-state representation of an address entry.
 * Maps to up to two CRD fields depending on ownership and direction:
 * ownership private/shared → spec.addresses / spec.sharedAddresses,
 * direction produces/consumes/both → spec.capabilities[0].producerOf / consumerOf.
 */
export interface Address {
  address: string;
  ownership: AddressOwnership;
  direction: AddressDirection;
  pubSub?: boolean;
  subscriptions?: string[];
}

export interface BrokerAppFormState {
  cr: BrokerAppCR;
  matchLabels: MatchLabel[];
  addresses: Address[];
}

export type BrokerAppFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_ADDRESS' }
  | { type: 'REMOVE_ADDRESS'; payload: { index: number } }
  | {
      type: 'UPDATE_ADDRESS';
      payload: { index: number } & Partial<
        Pick<Address, 'address' | 'ownership' | 'direction' | 'pubSub'>
      >;
    }
  | {
      type: 'ADD_SUBSCRIPTION';
      payload: { addressIndex: number; name: string };
    }
  | {
      type: 'REMOVE_SUBSCRIPTION';
      payload: { addressIndex: number; name: string };
    }
  | { type: 'ADD_MATCH_LABEL' }
  | { type: 'REMOVE_MATCH_LABEL'; payload: string }
  | { type: 'UPDATE_MATCH_LABEL'; payload: { id: string; key: string; value: string } }
  | { type: 'SET_MODEL'; payload: BrokerAppCR; preserveLabels?: boolean };

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

/**
 * Maps the address list to the three CRD spec fields:
 * spec.addresses, spec.sharedAddresses, and spec.capabilities.
 */
const syncAddressesToCR = (cr: BrokerAppCR, addresses: Address[]): void => {
  const cleanAddress = (e: Address): PrivateAddress => {
    const cleaned: PrivateAddress = { address: e.address.trim() };
    if (e.pubSub) cleaned.pubSub = e.pubSub;
    if (e.subscriptions?.length) cleaned.subscriptions = e.subscriptions;
    return cleaned;
  };

  const validAddresses = addresses.filter((e) => e.address.trim());

  const privateEntries = validAddresses.filter((e) => e.ownership === 'private').map(cleanAddress);

  const sharedEntries = validAddresses.filter((e) => e.ownership === 'shared').map(cleanAddress);

  const producerEntries = validAddresses
    .filter((e) => e.direction === 'produces' || e.direction === 'both')
    .map((e) => ({ address: e.address.trim() }));

  const consumerEntries = validAddresses
    .filter((e) => e.direction === 'consumes' || e.direction === 'both')
    .map((e) => ({ address: e.address.trim() }));

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
  const producerNames: string[] = (cap?.producerOf ?? []).map((a) => a.address);
  const consumerNames: string[] = (cap?.consumerOf ?? []).map((a) => a.address);
  const producerSet = new Set(producerNames);
  const consumerSet = new Set(consumerNames);

  const resolveDirection = (name: string): AddressDirection => {
    const isProducer = producerSet.has(name);
    const isConsumer = consumerSet.has(name);
    if (isProducer && isConsumer) return 'both';
    if (isConsumer) return 'consumes';
    return 'produces';
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
      addresses.push({
        address: addr,
        ownership: 'external',
        direction: resolveDirection(addr),
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
        if (changes.ownership === 'external') {
          updated.pubSub = undefined;
          updated.subscriptions = undefined;
        }
        if (changes.pubSub === false) {
          updated.subscriptions = undefined;
        }
        return updated;
      });
      break;
    }

    case 'ADD_SUBSCRIPTION': {
      const { addressIndex, name } = action.payload;
      addresses = addresses.map((e, i) =>
        i === addressIndex ? { ...e, subscriptions: [...(e.subscriptions ?? []), name] } : e,
      );
      break;
    }

    case 'REMOVE_SUBSCRIPTION': {
      const { addressIndex, name } = action.payload;
      addresses = addresses.map((e, i) =>
        i === addressIndex
          ? { ...e, subscriptions: (e.subscriptions ?? []).filter((s) => s !== name) }
          : e,
      );
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

    case 'SET_MODEL':
      cr = { ...action.payload, spec: { ...action.payload.spec } };
      matchLabels = action.preserveLabels
        ? mergeMatchLabelsWithYaml(matchLabels, cr.spec.selector?.matchLabels)
        : matchLabelsFromRecord(cr.spec.selector?.matchLabels);
      addresses = hydrateAddresses(cr);
      break;

    default:
      return state;
  }

  syncSelectorFromLabels(cr, matchLabels);
  syncAddressesToCR(cr, addresses);
  return { ...state, cr, matchLabels, addresses };
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
