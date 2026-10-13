import type { Dispatch } from 'react';
import { createContext, useContext } from 'react';
import type { BrokerService } from '../../k8s/types';
import { FORM_MEMORY_REGEX, validateBrokerServiceCR } from '../../validation/k8s';

export interface LabelEntry {
  key: string;
  value: string;
}

/**
 * One row of the Runtime Configuration environment variable editor, backing a single spec.env[] entry.
 * `id` only exists for the UI's list key and is never saved to the CR.
 */
export interface EnvVarEntry {
  id: string;
  name: string;
  value: string;
}

export interface BrokerServiceFormState {
  cr: BrokerService;
  labels: LabelEntry[];
  memoryValue: string;
  memoryUnit: 'Mi' | 'Gi';
  envVars: EnvVarEntry[];
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
  | { type: 'ADD_ENV_VAR' }
  | { type: 'REMOVE_ENV_VAR'; payload: number }
  | { type: 'UPDATE_ENV_VAR_NAME'; payload: { index: number; name: string } }
  | { type: 'UPDATE_ENV_VAR_VALUE'; payload: { index: number; value: string } }
  | {
      type: 'SET_MODEL';
      payload: BrokerService;
      yaml?: string;
      preserveLabels?: boolean;
      resetChanges?: boolean;
    };

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

// Monotonically increasing counter for env var row ids, so two rows can never get the same id.
let envVarIdSeq = 0;
const nextEnvVarId = (): string => `env-${(envVarIdSeq++).toString()}`;

/**
 * Reconstructs env var form rows from the CR's spec.env array.
 * Used when loading a CR from YAML, the cluster, or a Reload action.
 * Synthesizes a fresh `id` per row since the CR itself has no row identity concept.
 */
const envVarsFromArray = (env: { name: string; value: string }[] | undefined): EnvVarEntry[] =>
  env
    ? env.map(({ name, value }) => ({
        id: nextEnvVarId(),
        name,
        value,
      }))
    : [];

const parseMemory = (memoryStr: string | undefined): { value: string; unit: 'Mi' | 'Gi' } => {
  const match = FORM_MEMORY_REGEX.exec(memoryStr ?? '');
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
  const record = labelsToRecord(labels);
  if (record) {
    cr.metadata = { ...cr.metadata, labels: record };
  } else {
    cr.metadata = { ...cr.metadata };
    delete cr.metadata.labels;
  }
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

/**
 * Syncs env var rows into the CR's spec.env field.
 * Rows without a name are dropped — they cannot become a valid corev1.EnvVar entry,
 * and silently omitting them (rather than blocking submission) matches how blank
 * label rows are already handled elsewhere on this form.
 */
const syncEnvVarsToSpec = (cr: BrokerService, envVars: EnvVarEntry[]): void => {
  const validEntries = envVars
    .filter(({ name }) => name.trim())
    .map(({ name, value }) => ({ name: name.trim(), value }));
  cr.spec = { ...cr.spec };
  if (validEntries.length) {
    cr.spec.env = validEntries;
  } else {
    delete cr.spec.env;
  }
};

export const brokerServiceReducer = (
  state: BrokerServiceFormState,
  action: BrokerServiceFormAction,
): BrokerServiceFormState => {
  let cr = { ...state.cr, spec: { ...state.cr.spec } };
  let { labels, memoryValue, memoryUnit, envVars } = state;

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

    case 'ADD_ENV_VAR':
      envVars = [...envVars, { id: nextEnvVarId(), name: '', value: '' }];
      break;

    case 'REMOVE_ENV_VAR':
      envVars = envVars.filter((_, i) => i !== action.payload);
      break;

    case 'UPDATE_ENV_VAR_NAME':
      envVars = envVars.map((e, i) =>
        i === action.payload.index ? { ...e, name: action.payload.name } : e,
      );
      break;

    case 'UPDATE_ENV_VAR_VALUE':
      envVars = envVars.map((e, i) =>
        i === action.payload.index ? { ...e, value: action.payload.value } : e,
      );
      break;

    case 'SET_MODEL':
      if (action.yaml) {
        const error = validateBrokerServiceCR(action.payload, action.yaml);
        if (error) return state;
      }
      cr = { ...cloneBrokerService(action.payload), spec: { ...action.payload.spec } };
      labels = action.preserveLabels
        ? mergeFormLabelsWithYaml(state.labels, cr.metadata?.labels)
        : labelsFromRecord(cr.metadata?.labels);
      ({ value: memoryValue, unit: memoryUnit } = parseMemory(cr.spec.resources?.limits?.memory));
      envVars = envVarsFromArray(cr.spec.env);
      syncLabelsToMetadata(cr, labels);
      syncMemoryToSpec(cr, memoryValue, memoryUnit);
      syncEnvVarsToSpec(cr, envVars);
      return {
        ...state,
        cr,
        labels,
        memoryValue,
        memoryUnit,
        envVars,
        hasChanges: !action.resetChanges,
      };

    default:
      return state;
  }

  syncLabelsToMetadata(cr, labels);
  syncMemoryToSpec(cr, memoryValue, memoryUnit);
  syncEnvVarsToSpec(cr, envVars);
  return { ...state, cr, labels, memoryValue, memoryUnit, envVars, hasChanges: true };
};

const formStateFromCr = (cr: BrokerService): BrokerServiceFormState => {
  const clonedCr = cloneBrokerService(cr);
  const mem = parseMemory(clonedCr.spec?.resources?.limits?.memory);
  return {
    cr: clonedCr,
    labels: labelsFromRecord(clonedCr.metadata?.labels),
    memoryValue: mem.value,
    memoryUnit: mem.unit,
    envVars: envVarsFromArray(clonedCr.spec?.env),
    hasChanges: false,
  };
};

/** Builds edit-form state from a BrokerService CR fetched from the cluster. */
export const createBrokerServiceStateFromCr = (cr: BrokerService): BrokerServiceFormState =>
  formStateFromCr(cr);

const DEFAULT_INSTANCE_LABEL_KEY = 'app.kubernetes.io/instance';

export const createInitialBrokerServiceState = (namespace: string): BrokerServiceFormState => {
  const defaultName = 'my-messaging-service';
  return formStateFromCr({
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerService',
    metadata: {
      name: defaultName,
      namespace,
      labels: { [DEFAULT_INSTANCE_LABEL_KEY]: defaultName },
    },
    spec: {
      resources: {
        limits: {
          memory: '2Gi',
        },
      },
    },
  });
};

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
