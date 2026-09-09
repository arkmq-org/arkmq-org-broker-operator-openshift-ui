import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type {
  BrokerAppCapability,
  BrokerAppCR,
  BrokerAppSpec,
  PrivateAddress,
} from '../../k8s/types';

export interface MatchLabel {
  id: string;
  key: string;
  value: string;
}

export type AddressField = 'producerOf' | 'consumerOf';

/**
 * Discriminates which address list a subscription action targets.
 * Allows ADD_SUBSCRIPTION and REMOVE_SUBSCRIPTION to serve both
 * privateAddresses and sharedAddresses from a single reducer branch.
 */
export type AddressKind = 'private' | 'shared';

export interface BrokerAppFormState {
  cr: BrokerAppCR;
  matchLabels: MatchLabel[];
  producerOf: string[];
  consumerOf: string[];
  privateAddresses: PrivateAddress[];
  sharedAddresses: PrivateAddress[];
}

export type BrokerAppFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_ADDRESS'; field: AddressField; payload: string }
  | { type: 'REMOVE_ADDRESS'; field: AddressField; payload: string }
  | { type: 'ADD_MATCH_LABEL' }
  | { type: 'REMOVE_MATCH_LABEL'; payload: string }
  | { type: 'UPDATE_MATCH_LABEL'; payload: { id: string; key: string; value: string } }
  | { type: 'ADD_ADDRESS_ENTRY'; payload: { addressKind: AddressKind } }
  | { type: 'REMOVE_ADDRESS_ENTRY'; payload: { addressKind: AddressKind; index: number } }
  | {
      type: 'UPDATE_ADDRESS_ENTRY';
      /** Scalar field updates only — subscription list mutations go through ADD/REMOVE_SUBSCRIPTION. */
      payload: { addressKind: AddressKind; index: number } & Partial<
        Pick<PrivateAddress, 'address' | 'pubSub'>
      >;
    }
  | {
      type: 'ADD_SUBSCRIPTION';
      /** Appends a subscription name to the entry at addressIndex in the chosen list. */
      payload: { addressKind: AddressKind; addressIndex: number; name: string };
    }
  | {
      type: 'REMOVE_SUBSCRIPTION';
      /** Removes the first occurrence of name from the entry at addressIndex in the chosen list. */
      payload: { addressKind: AddressKind; addressIndex: number; name: string };
    }
  | { type: 'SET_MODEL'; payload: BrokerAppCR; preserveLabels?: boolean };

// --- helpers ---

const buildCapabilities = (
  producerOf: string[],
  consumerOf: string[],
): BrokerAppCapability[] | undefined => {
  const cap: BrokerAppCapability = {};
  if (producerOf.length) cap.producerOf = producerOf.map((a) => ({ address: a }));
  if (consumerOf.length) cap.consumerOf = consumerOf.map((a) => ({ address: a }));
  return Object.keys(cap).length ? [cap] : undefined;
};

// First occurrence wins so duplicate form rows do not overwrite YAML preview values.
const buildMatchLabels = (labels: MatchLabel[]): Record<string, string> | undefined => {
  const result: Record<string, string> = {};
  labels.forEach(({ key, value }) => {
    if (key && !(key in result)) {
      result[key] = value;
    }
  });
  return Object.keys(result).length ? result : undefined;
};

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
  if (!yamlLabels) {
    return formLabels;
  }
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

const addressesFromCapabilities = (
  capabilities: BrokerAppCapability[] | undefined,
  field: AddressField,
): string[] => {
  const arr = capabilities?.[0]?.[field];
  return arr ? arr.map((a) => a.address) : [];
};

const buildAddresses = (entries: PrivateAddress[]): PrivateAddress[] | undefined => {
  const valid = entries
    .filter((e) => e.address.trim())
    .map((e) => {
      const clean: PrivateAddress = { address: e.address.trim() };
      if (e.pubSub) clean.pubSub = e.pubSub;
      if (e.subscriptions?.length) clean.subscriptions = e.subscriptions;
      return clean;
    });
  return valid.length ? valid : undefined;
};

/**
 * Derives spec from the form-level state fields.
 * Called once at the reducer tail on the final next-state, so individual cases
 * never need to thread positional argument lists manually.
 */
const buildSpec = ({
  matchLabels,
  producerOf,
  consumerOf,
  privateAddresses,
  sharedAddresses,
}: BrokerAppFormState): BrokerAppSpec => {
  const resolvedMatchLabels = buildMatchLabels(matchLabels);
  const capabilities = buildCapabilities(producerOf, consumerOf);
  const addresses = buildAddresses(privateAddresses);
  const shared = buildAddresses(sharedAddresses);
  const spec: BrokerAppSpec = {};
  if (resolvedMatchLabels) spec.selector = { matchLabels: resolvedMatchLabels };
  if (capabilities) spec.capabilities = capabilities;
  if (addresses) spec.addresses = addresses;
  if (shared) spec.sharedAddresses = shared;
  return spec;
};

// --- reducer ---

export const brokerAppReducer = (
  state: BrokerAppFormState,
  action: BrokerAppFormAction,
): BrokerAppFormState => {
  let next = { ...state };

  switch (action.type) {
    case 'SET_NAME':
      return {
        ...state,
        cr: { ...state.cr, metadata: { ...state.cr.metadata, name: action.payload } },
      };

    case 'ADD_ADDRESS': {
      if (state[action.field].includes(action.payload)) return state;
      next[action.field] = [...state[action.field], action.payload];
      break;
    }

    case 'REMOVE_ADDRESS': {
      next[action.field] = state[action.field].filter((a) => a !== action.payload);
      break;
    }

    case 'ADD_ADDRESS_ENTRY': {
      const listKey =
        action.payload.addressKind === 'private' ? 'privateAddresses' : 'sharedAddresses';
      next[listKey] = [...state[listKey], { address: '' }];
      break;
    }

    case 'REMOVE_ADDRESS_ENTRY': {
      const listKey =
        action.payload.addressKind === 'private' ? 'privateAddresses' : 'sharedAddresses';
      next[listKey] = state[listKey].filter((_, i) => i !== action.payload.index);
      break;
    }

    case 'UPDATE_ADDRESS_ENTRY': {
      const { addressKind, index, ...changes } = action.payload;
      const listKey = addressKind === 'private' ? 'privateAddresses' : 'sharedAddresses';
      next[listKey] = state[listKey].map((e, i) => {
        if (i !== index) return e;
        const updated = { ...e, ...changes };
        if (changes.pubSub === false) {
          updated.subscriptions = undefined;
        }
        return updated;
      });
      break;
    }

    case 'ADD_SUBSCRIPTION': {
      const { addressKind, addressIndex, name } = action.payload;
      const listKey = addressKind === 'private' ? 'privateAddresses' : 'sharedAddresses';
      next[listKey] = state[listKey].map((e, i) =>
        i === addressIndex ? { ...e, subscriptions: [...(e.subscriptions ?? []), name] } : e,
      );
      break;
    }

    case 'REMOVE_SUBSCRIPTION': {
      const { addressKind, addressIndex, name } = action.payload;
      const listKey = addressKind === 'private' ? 'privateAddresses' : 'sharedAddresses';
      next[listKey] = state[listKey].map((e, i) =>
        i === addressIndex
          ? { ...e, subscriptions: (e.subscriptions ?? []).filter((s) => s !== name) }
          : e,
      );
      break;
    }

    case 'ADD_MATCH_LABEL': {
      next.matchLabels = [...state.matchLabels, { id: String(Date.now()), key: '', value: '' }];
      break;
    }

    case 'REMOVE_MATCH_LABEL': {
      next.matchLabels = state.matchLabels.filter((l) => l.id !== action.payload);
      break;
    }

    case 'UPDATE_MATCH_LABEL': {
      next.matchLabels = state.matchLabels.map((l) =>
        l.id === action.payload.id
          ? { ...l, key: action.payload.key, value: action.payload.value }
          : l,
      );
      break;
    }

    case 'SET_MODEL': {
      const newCr = action.payload;
      const privateAddresses = privateAddressesFromSpec(newCr.spec.addresses);
      const sharedAddresses = privateAddressesFromSpec(newCr.spec.sharedAddresses);
      if (action.preserveLabels) {
        const mergedMatchLabels = mergeMatchLabelsWithYaml(
          state.matchLabels,
          newCr.spec.selector?.matchLabels,
        );
        next = {
          ...state,
          matchLabels: mergedMatchLabels,
          producerOf: addressesFromCapabilities(newCr.spec.capabilities, 'producerOf'),
          consumerOf: addressesFromCapabilities(newCr.spec.capabilities, 'consumerOf'),
          privateAddresses,
          sharedAddresses,
          cr: newCr,
        };
      } else {
        next = {
          ...state,
          matchLabels: matchLabelsFromRecord(newCr.spec.selector?.matchLabels),
          producerOf: addressesFromCapabilities(newCr.spec.capabilities, 'producerOf'),
          consumerOf: addressesFromCapabilities(newCr.spec.capabilities, 'consumerOf'),
          privateAddresses,
          sharedAddresses,
          cr: newCr,
        };
      }
      break;
    }

    default:
      return state;
  }

  return { ...next, cr: { ...next.cr, spec: buildSpec(next) } };
};

// Converts CR spec.addresses into form-level address rows.
const privateAddressesFromSpec = (addresses: PrivateAddress[] | undefined): PrivateAddress[] =>
  addresses ?? [];

export const createInitialBrokerAppState = (namespace: string): BrokerAppFormState => ({
  cr: {
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'my-messaging-app', namespace },
    spec: {},
  },
  matchLabels: [{ id: String(Date.now()), key: '', value: '' }], // MatchLabel id is kept — it guards against duplicate key-entry collisions on rapid adds
  producerOf: [],
  consumerOf: [],
  privateAddresses: [],
  sharedAddresses: [],
});

export const BrokerAppFormStateContext = createContext<BrokerAppFormState | undefined>(undefined);
export const BrokerAppFormDispatchContext = createContext<
  Dispatch<BrokerAppFormAction> | undefined
>(undefined);

export const useBrokerAppFormState = (): BrokerAppFormState => {
  const ctx = useContext(BrokerAppFormStateContext);
  if (!ctx)
    throw new Error('useBrokerAppFormState must be used inside BrokerAppFormStateContext.Provider');
  return ctx;
};

export const useBrokerAppFormDispatch = (): Dispatch<BrokerAppFormAction> => {
  const ctx = useContext(BrokerAppFormDispatchContext);
  if (!ctx)
    throw new Error(
      'useBrokerAppFormDispatch must be used inside BrokerAppFormDispatchContext.Provider',
    );
  return ctx;
};
