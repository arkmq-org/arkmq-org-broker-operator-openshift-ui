import { renderHook } from '@testing-library/react';
import type { BrokerService } from '../../k8s/types';
import {
  brokerServiceReducer,
  createInitialBrokerServiceState,
  useBrokerServiceFormDispatch,
  useBrokerServiceFormState,
} from './reducer';

const TEST_NAMESPACE = 'test-namespace';

const createState = () => createInitialBrokerServiceState(TEST_NAMESPACE);

describe('brokerServiceReducer', () => {
  it('creates initial form state with default CR for the namespace', () => {
    const state = createInitialBrokerServiceState(TEST_NAMESPACE);

    expect(state.cr).toEqual({
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: { name: 'my-messaging-service', namespace: TEST_NAMESPACE },
      spec: { resources: { limits: { memory: '2Gi' } } },
    });
    expect(state.labels).toEqual([]);
    expect(state.memoryValue).toBe('2');
    expect(state.memoryUnit).toBe('Gi');
  });

  it('SET_NAME updates the CR metadata name', () => {
    let state = createState();
    state = brokerServiceReducer(state, { type: 'SET_NAME', payload: 'my-broker-service' });

    expect(state.cr.metadata?.name).toBe('my-broker-service');
    expect(state.cr.metadata?.namespace).toBe(TEST_NAMESPACE);
  });

  it('ADD_LABEL does not add empty keys to CR metadata labels', () => {
    let state = createState();
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });

    expect(state.labels).toHaveLength(1);
    expect(state.cr.metadata?.labels).toBeUndefined();
  });

  it('UPDATE_LABEL_KEY, UPDATE_LABEL_VALUE, and REMOVE_LABEL sync labels on the CR', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    expect(state.labels).toHaveLength(1);

    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 0, key: 'forWorkQueue' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 0, value: 'true' },
    });

    expect(state.labels[0]).toEqual({ key: 'forWorkQueue', value: 'true' });
    expect(state.cr.metadata?.labels).toEqual({ forWorkQueue: 'true' });

    state = brokerServiceReducer(state, { type: 'REMOVE_LABEL', payload: 0 });

    expect(state.labels).toEqual([]);
    expect(state.cr.metadata?.labels).toBeUndefined();
  });

  it('REMOVE_LABEL removes the label from CR metadata labels', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 0, key: 'forWorkQueue' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 0, value: 'true' },
    });

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'app' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'messaging' },
    });

    expect(state.labels).toEqual([
      { key: 'forWorkQueue', value: 'true' },
      { key: 'app', value: 'messaging' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({
      forWorkQueue: 'true',
      app: 'messaging',
    });

    state = brokerServiceReducer(state, { type: 'REMOVE_LABEL', payload: 0 });

    expect(state.labels).toEqual([{ key: 'app', value: 'messaging' }]);
    expect(state.cr.metadata?.labels).toEqual({ app: 'messaging' });
  });

  it('uses the first value when duplicate label keys are synced to the CR', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 0, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 0, value: 'test' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'some-value' },
    });

    expect(state.labels).toEqual([
      { key: 'key1', value: 'test' },
      { key: 'key1', value: 'some-value' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({ key1: 'test' });
  });

  it('SET_MODEL with preserveLabels keeps form label rows when duplicates exist', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 0, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 0, value: 'test' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'some-value' },
    });

    const yamlCr: BrokerService = {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: {
        name: 'from-yaml',
        namespace: TEST_NAMESPACE,
        labels: { key1: 'test' },
      },
      spec: { resources: { limits: { memory: '4Gi' } } },
    };

    const next = brokerServiceReducer(state, {
      type: 'SET_MODEL',
      payload: yamlCr,
      preserveLabels: true,
    });

    expect(next.labels).toEqual(state.labels);
    expect(next.cr.metadata?.labels).toEqual({ key1: 'test' });
    expect(next.cr.metadata?.name).toBe('from-yaml');
    expect(next.memoryValue).toBe('4');
  });

  it('SET_MODEL with preserveLabels merges new YAML-only label keys into form rows', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 0, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 0, value: 'value1' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'value2' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 2, key: 'key2' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 2, value: 'something' },
    });

    const next = brokerServiceReducer(state, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerService',
        metadata: {
          name: 'from-yaml',
          namespace: TEST_NAMESPACE,
          labels: { key1: 'value1', key2: 'something', key3: 'test' },
        },
        spec: { resources: { limits: { memory: '4Gi' } } },
      },
      preserveLabels: true,
    });

    expect(next.labels).toEqual([
      { key: 'key1', value: 'value1' },
      { key: 'key1', value: 'value2' },
      { key: 'key2', value: 'something' },
      { key: 'key3', value: 'test' },
    ]);
    expect(next.cr.metadata?.labels).toEqual({
      key1: 'value1',
      key2: 'something',
      key3: 'test',
    });
  });

  it('SET_MEMORY_VALUE syncs the CR memory limit string', () => {
    const state = createState();
    const next = brokerServiceReducer(state, { type: 'SET_MEMORY_VALUE', payload: '4' });

    expect(next.memoryValue).toBe('4');
    expect(next.cr.spec?.resources?.limits?.memory).toBe('4Gi');
  });

  it('SET_MEMORY_UNIT syncs the CR memory limit string', () => {
    const state = createState();
    const next = brokerServiceReducer(state, { type: 'SET_MEMORY_UNIT', payload: 'Mi' });

    expect(next.memoryUnit).toBe('Mi');
    expect(next.cr.spec?.resources?.limits?.memory).toBe('2Mi');
  });

  it('SET_MODEL populates labels and memory from an existing CR', () => {
    const state = createState();
    const newCr: BrokerService = {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: {
        name: 'updated-broker',
        namespace: TEST_NAMESPACE,
        labels: { forWorkQueue: 'true', app: 'messaging' },
      },
      spec: { resources: { limits: { memory: '512Mi' } } },
    };

    const next = brokerServiceReducer(state, { type: 'SET_MODEL', payload: newCr });

    expect(next.cr).toBe(newCr);
    expect(next.labels).toEqual([
      { key: 'forWorkQueue', value: 'true' },
      { key: 'app', value: 'messaging' },
    ]);
    expect(next.memoryValue).toBe('512');
    expect(next.memoryUnit).toBe('Mi');
  });

  it('SET_MODEL with empty spec clears labels and resets memory defaults', () => {
    const state = brokerServiceReducer(createState(), {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerService',
        metadata: { name: 'empty', namespace: TEST_NAMESPACE },
        spec: {},
      },
    });

    expect(state.labels).toEqual([]);
    expect(state.memoryValue).toBe('2');
    expect(state.memoryUnit).toBe('Gi');
  });
});

describe('broker service hooks', () => {
  it('useBrokerServiceFormState throws when used outside its Provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useBrokerServiceFormState())).toThrow(
      'useBrokerServiceFormState must be used inside BrokerServiceFormStateContext.Provider',
    );

    jest.restoreAllMocks();
  });

  it('useBrokerServiceFormDispatch throws when used outside its Provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useBrokerServiceFormDispatch())).toThrow(
      'useBrokerServiceFormDispatch must be used inside BrokerServiceFormDispatchContext.Provider',
    );

    jest.restoreAllMocks();
  });
});
