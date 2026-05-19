import { createContext, Dispatch, useContext } from 'react';
import { BrokerService, EditorType } from '../../k8s/types';

export type LabelEntry = { key: string; value: string };

export type BrokerServiceFormState = {
  cr: BrokerService;
  labels: LabelEntry[];
  memoryValue: string;
  memoryUnit: 'Mi' | 'Gi';
  editorType: EditorType;
};

export type BrokerServiceFormAction =
  | { type: 'SET_NAME'; payload: string }
  | { type: 'ADD_LABEL' }
  | { type: 'REMOVE_LABEL'; payload: number }
  | { type: 'UPDATE_LABEL_KEY'; payload: { index: number; key: string } }
  | { type: 'UPDATE_LABEL_VALUE'; payload: { index: number; value: string } }
  | { type: 'SET_MEMORY_VALUE'; payload: string }
  | { type: 'SET_MEMORY_UNIT'; payload: 'Mi' | 'Gi' }
  | { type: 'SET_EDITOR_TYPE'; payload: EditorType }
  | { type: 'SET_MODEL'; payload: BrokerService };

const labelsToRecord = (labels: LabelEntry[]): Record<string, string> | undefined => {
  const record: Record<string, string> = {};
  labels.forEach(({ key, value }) => {
    if (key) record[key] = value;
  });
  return Object.keys(record).length > 0 ? record : undefined;
};

const labelsFromRecord = (record: Record<string, string> | undefined): LabelEntry[] => {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value }));
};

const parseMemory = (memoryStr: string | undefined): { value: string; unit: 'Mi' | 'Gi' } => {
  const match = (memoryStr || '').match(/^(\d+(?:\.\d+)?)(Mi|Gi)$/);
  return {
    value: match ? match[1] : '2',
    unit: match && (match[2] === 'Mi' || match[2] === 'Gi') ? match[2] : 'Gi',
  };
};

const buildMemoryString = (value: string, unit: 'Mi' | 'Gi'): string => `${value}${unit}`;

export const brokerServiceReducer = (
  state: BrokerServiceFormState,
  action: BrokerServiceFormAction,
): BrokerServiceFormState => {
  switch (action.type) {
    case 'SET_NAME':
      return {
        ...state,
        cr: {
          ...state.cr,
          metadata: { ...state.cr.metadata, name: action.payload },
        },
      };

    case 'ADD_LABEL':
      return { ...state, labels: [...state.labels, { key: '', value: '' }] };

    case 'REMOVE_LABEL': {
      const labels = state.labels.filter((_, i) => i !== action.payload);
      return {
        ...state,
        labels,
        cr: {
          ...state.cr,
          metadata: { ...state.cr.metadata, labels: labelsToRecord(labels) },
        },
      };
    }

    case 'UPDATE_LABEL_KEY': {
      const labels = [...state.labels];
      labels[action.payload.index] = { ...labels[action.payload.index], key: action.payload.key };
      return {
        ...state,
        labels,
        cr: {
          ...state.cr,
          metadata: { ...state.cr.metadata, labels: labelsToRecord(labels) },
        },
      };
    }

    case 'UPDATE_LABEL_VALUE': {
      const labels = [...state.labels];
      labels[action.payload.index] = {
        ...labels[action.payload.index],
        value: action.payload.value,
      };
      return {
        ...state,
        labels,
        cr: {
          ...state.cr,
          metadata: { ...state.cr.metadata, labels: labelsToRecord(labels) },
        },
      };
    }

    case 'SET_MEMORY_VALUE': {
      return {
        ...state,
        memoryValue: action.payload,
        cr: {
          ...state.cr,
          spec: {
            ...state.cr.spec,
            resources: {
              limits: { memory: buildMemoryString(action.payload, state.memoryUnit) },
            },
          },
        },
      };
    }

    case 'SET_MEMORY_UNIT': {
      return {
        ...state,
        memoryUnit: action.payload,
        cr: {
          ...state.cr,
          spec: {
            ...state.cr.spec,
            resources: {
              limits: { memory: buildMemoryString(state.memoryValue, action.payload) },
            },
          },
        },
      };
    }

    case 'SET_EDITOR_TYPE':
      return { ...state, editorType: action.payload };

    case 'SET_MODEL': {
      const newCr = action.payload;
      const mem = parseMemory(newCr.spec?.resources?.limits?.memory);
      return {
        ...state,
        cr: newCr,
        labels: labelsFromRecord(newCr.metadata?.labels),
        memoryValue: mem.value,
        memoryUnit: mem.unit,
      };
    }

    default:
      return state;
  }
};

export const createInitialBrokerServiceState = (cr: BrokerService): BrokerServiceFormState => {
  const mem = parseMemory(cr.spec?.resources?.limits?.memory);
  return {
    cr,
    labels: labelsFromRecord(cr.metadata?.labels),
    memoryValue: mem.value,
    memoryUnit: mem.unit,
    editorType: EditorType.FORM,
  };
};

export const createEmptyBrokerService = (namespace: string): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: {
    name: '',
    namespace: namespace || '',
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
    throw new Error('useBrokerServiceFormState must be used inside BrokerServiceCreatePage');
  }
  return ctx;
};

export const useBrokerServiceFormDispatch = (): Dispatch<BrokerServiceFormAction> => {
  const ctx = useContext(BrokerServiceFormDispatchContext);
  if (!ctx) {
    throw new Error('useBrokerServiceFormDispatch must be used inside BrokerServiceCreatePage');
  }
  return ctx;
};
