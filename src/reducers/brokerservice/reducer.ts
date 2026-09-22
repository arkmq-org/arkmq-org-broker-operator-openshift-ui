import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { BrokerService } from '../../k8s/types';

export interface LabelEntry {
  key: string;
  value: string;
}

export interface BrokerServiceFormState {
  cr: BrokerService;
  labels: LabelEntry[];
  memoryValue: string;
  memoryUnit: 'Mi' | 'Gi';
  hasChanges: boolean;
}

export type BrokerServiceFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; payload: number }
  | { type: 'UPDATE_LABEL_KEY'; payload: { index: number; key: string } }
  | { type: 'UPDATE_LABEL_VALUE'; payload: { index: number; value: string } }
  | { type: 'SET_MEMORY_VALUE'; payload: string }
  | { type: 'SET_MEMORY_UNIT'; payload: 'Mi' | 'Gi' }
  /**
   * Overrides the broker container image.
   * An empty or whitespace-only payload removes spec.image so the operator uses its default.
   */
  | { type: 'SET_IMAGE'; payload: string }
  | { type: 'SET_MODEL'; payload: BrokerService; preserveLabels?: boolean; resetChanges?: boolean };

// First occurrence wins so duplicate form rows do not overwrite YAML preview values.
const labelsToRecord = (labels: LabelEntry[]): Record<string, string> | undefined => {
  const record: Record<string, string> = {};
  labels.forEach(({ key, value }) => {
    if (key && !(key in record)) {
      record[key] = value;
    }
  });
  return Object.keys(record).length > 0 ? record : undefined;
};

const labelsFromRecord = (record: Record<string, string> | undefined): LabelEntry[] => {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
};

const mergeFormLabelsWithYaml = (
  formLabels: LabelEntry[],
  yamlLabels: Record<string, string> | undefined,
): LabelEntry[] => {
  if (!yamlLabels) {
    return formLabels;
  }
  const existingKeys = new Set(formLabels.map(({ key }) => key).filter(Boolean));
  const merged = [...formLabels];
  Object.entries(yamlLabels).forEach(([key, value]) => {
    if (!existingKeys.has(key)) {
      merged.push({ key, value });
      existingKeys.add(key);
    }
  });
  return merged;
};

const parseMemory = (memoryStr: string | undefined): { value: string; unit: 'Mi' | 'Gi' } => {
  const match = /^(\d+(?:\.\d+)?)(Mi|Gi)$/.exec(memoryStr ?? '');
  return {
    value: match ? match[1] : '2',
    unit: match && (match[2] === 'Mi' || match[2] === 'Gi') ? match[2] : 'Gi',
  };
};

const buildMemoryString = (value: string, unit: 'Mi' | 'Gi'): string => `${value}${unit}`;

/** Clones a BrokerService CR before storing it in form state, isolating edits from the watched cluster object. */
const cloneBrokerService = (cr: BrokerService): BrokerService =>
  JSON.parse(JSON.stringify(cr)) as BrokerService;

// --- reducer ---

/** Syncs the label array into the CR's metadata.labels field. */
const syncLabelsToMetadata = (cr: BrokerService, labels: LabelEntry[]): void => {
  cr.metadata = { ...cr.metadata, labels: labelsToRecord(labels) };
};

/** Syncs memory value and unit into the CR's spec.resources.limits.memory field. */
const syncMemoryToSpec = (
  cr: BrokerService,
  memoryValue: string,
  memoryUnit: 'Mi' | 'Gi',
): void => {
  cr.spec = {
    ...cr.spec,
    resources: { limits: { memory: buildMemoryString(memoryValue, memoryUnit) } },
  };
};

export const brokerServiceReducer = (
  state: BrokerServiceFormState,
  action: BrokerServiceFormAction,
): BrokerServiceFormState => {
  let cr = { ...state.cr, spec: { ...state.cr.spec } };
  let { labels, memoryValue, memoryUnit } = state;

  switch (action.type) {
    case 'SET_NAME':
      cr.metadata = { ...cr.metadata, name: action.payload };
      break;

    case 'ADD_LABEL':
      labels = [...labels, { key: '', value: '' }];
      break;

    case 'REMOVE_LABEL':
      labels = labels.filter((_, i) => i !== action.payload);
      break;

    case 'UPDATE_LABEL_KEY':
      labels = [...labels];
      labels[action.payload.index] = { ...labels[action.payload.index], key: action.payload.key };
      break;

    case 'UPDATE_LABEL_VALUE':
      labels = [...labels];
      labels[action.payload.index] = {
        ...labels[action.payload.index],
        value: action.payload.value,
      };
      break;

    case 'SET_MEMORY_VALUE':
      memoryValue = action.payload;
      break;

    case 'SET_MEMORY_UNIT':
      memoryUnit = action.payload;
      break;

    case 'SET_IMAGE': {
      const trimmed = action.payload.trim();
      if (trimmed) {
        cr.spec.image = trimmed;
      } else {
        delete cr.spec.image;
      }
      break;
    }

    case 'SET_MODEL':
      cr = { ...cloneBrokerService(action.payload), spec: { ...action.payload.spec } };
      labels = action.preserveLabels
        ? mergeFormLabelsWithYaml(state.labels, cr.metadata?.labels)
        : labelsFromRecord(cr.metadata?.labels);
      ({ value: memoryValue, unit: memoryUnit } = parseMemory(cr.spec.resources?.limits?.memory));
      syncLabelsToMetadata(cr, labels);
      syncMemoryToSpec(cr, memoryValue, memoryUnit);
      return { ...state, cr, labels, memoryValue, memoryUnit, hasChanges: !action.resetChanges };

    default:
      return state;
  }

  syncLabelsToMetadata(cr, labels);
  syncMemoryToSpec(cr, memoryValue, memoryUnit);
  return { ...state, cr, labels, memoryValue, memoryUnit, hasChanges: true };
};

const formStateFromCr = (cr: BrokerService): BrokerServiceFormState => {
  const clonedCr = cloneBrokerService(cr);
  const mem = parseMemory(clonedCr.spec?.resources?.limits?.memory);
  return {
    cr: clonedCr,
    labels: labelsFromRecord(clonedCr.metadata?.labels),
    memoryValue: mem.value,
    memoryUnit: mem.unit,
    hasChanges: false,
  };
};

/** Builds edit-form state from a BrokerService CR fetched from the cluster. */
export const createBrokerServiceStateFromCr = (cr: BrokerService): BrokerServiceFormState =>
  formStateFromCr(cr);

export const createInitialBrokerServiceState = (namespace: string): BrokerServiceFormState =>
  formStateFromCr({
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerService',
    metadata: {
      name: 'my-messaging-service',
      namespace,
    },
    spec: {
      resources: {
        limits: {
          memory: '2Gi',
        },
      },
    },
  });

export const BrokerServiceFormStateContext = createContext<BrokerServiceFormState | undefined>(
  undefined,
);
export const BrokerServiceFormDispatchContext = createContext<
  Dispatch<BrokerServiceFormAction> | undefined
>(undefined);

export const useBrokerServiceFormState = (): BrokerServiceFormState => {
  const ctx = useContext(BrokerServiceFormStateContext);
  if (!ctx) {
    throw new Error(
      'useBrokerServiceFormState must be used inside BrokerServiceFormStateContext.Provider',
    );
  }
  return ctx;
};

export const useBrokerServiceFormDispatch = (): Dispatch<BrokerServiceFormAction> => {
  const ctx = useContext(BrokerServiceFormDispatchContext);
  if (!ctx) {
    throw new Error(
      'useBrokerServiceFormDispatch must be used inside BrokerServiceFormDispatchContext.Provider',
    );
  }
  return ctx;
};
