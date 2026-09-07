import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { BrokerAppCR, BrokerAppSpec } from '../../k8s/types';

export interface MatchLabel {
  id: string;
  key: string;
  value: string;
}

export type AddressField = 'producerOf' | 'consumerOf';

export interface BrokerAppFormState {
  cr: BrokerAppCR;
  matchLabels: MatchLabel[];
  hasChanges: boolean;
}

export type BrokerAppFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_ADDRESS'; field: AddressField; payload: string }
  | { type: 'REMOVE_ADDRESS'; field: AddressField; payload: string }
  | { type: 'ADD_MATCH_LABEL' }
  | { type: 'REMOVE_MATCH_LABEL'; payload: string }
  | { type: 'UPDATE_MATCH_LABEL'; payload: { id: string; key: string; value: string } }
  | { type: 'SET_MODEL'; payload: BrokerAppCR; preserveLabels?: boolean; resetChanges?: boolean }
  | { type: 'SET_CPU_REQUEST'; payload: string }
  | { type: 'SET_CPU_LIMIT'; payload: string }
  | { type: 'SET_MEMORY_REQUEST'; payload: string }
  | { type: 'SET_MEMORY_LIMIT'; payload: string };

// --- CR readers ---

/**
 * Extracts addresses from the CR's capabilities for display in the form.
 * The CR stores addresses as MatchAddress objects; this returns plain strings.
 *
 * @param cr - The BrokerApp custom resource
 * @param field - Which address list to read ('producerOf' or 'consumerOf')
 * @returns Flat string array of address names
 */
export const getAddresses = (cr: BrokerAppCR, field: AddressField): string[] => {
  const arr = cr.spec.capabilities?.[0]?.[field];
  return arr ? arr.map((a) => a.address) : [];
};

// --- CR writers ---

/**
 * Replaces one address list (producerOf or consumerOf) on the CR's spec.
 * Cleans up the capabilities array when both lists become empty.
 */
const setAddresses = (cr: BrokerAppCR, field: AddressField, addresses: string[]): void => {
  if (!cr.spec.capabilities?.[0]) {
    cr.spec.capabilities = [{}];
  }
  if (addresses.length) {
    cr.spec.capabilities[0][field] = addresses.map((a) => ({ address: a }));
  } else if (field === 'producerOf') {
    delete cr.spec.capabilities[0].producerOf;
  } else {
    delete cr.spec.capabilities[0].consumerOf;
  }
  const cap = cr.spec.capabilities[0];
  if (!cap.producerOf && !cap.consumerOf) {
    delete cr.spec.capabilities;
  }
};

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

// --- reducer ---

export const brokerAppReducer = (
  state: BrokerAppFormState,
  action: BrokerAppFormAction,
): BrokerAppFormState => {
  let cr = { ...state.cr, spec: { ...state.cr.spec } };
  let { matchLabels } = state;

  switch (action.type) {
    case 'SET_NAME':
      cr.metadata = { ...cr.metadata, name: action.payload };
      break;

    case 'ADD_ADDRESS': {
      const current = getAddresses(cr, action.field);
      if (current.includes(action.payload)) return state;
      setAddresses(cr, action.field, [...current, action.payload]);
      break;
    }

    case 'REMOVE_ADDRESS':
      setAddresses(
        cr,
        action.field,
        getAddresses(cr, action.field).filter((a) => a !== action.payload),
      );
      break;

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
      syncSelectorFromLabels(cr, matchLabels);
      return { ...state, cr, matchLabels, hasChanges: !action.resetChanges };

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
  return { ...state, cr, matchLabels, hasChanges: true };
};

export const createInitialBrokerAppState = (namespace: string): BrokerAppFormState => ({
  cr: {
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'my-messaging-app', namespace },
    spec: {},
  },
  matchLabels: [{ id: String(Date.now()), key: '', value: '' }],
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
