import { renderHook } from '@testing-library/react';
import type { BrokerService } from '../../k8s/types';
import {
  brokerServiceReducer,
  createBrokerServiceStateFromCr,
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
      metadata: {
        name: 'my-messaging-service',
        namespace: TEST_NAMESPACE,
        labels: { 'app.kubernetes.io/instance': 'my-messaging-service' },
      },
      spec: { resources: { limits: { memory: '2Gi' } } },
    });
    expect(state.labels).toEqual([
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
    ]);
    expect(state.memoryValue).toBe('2');
    expect(state.memoryUnit).toBe('Gi');
    expect(state.envVars).toEqual([]);
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

    expect(state.labels).toHaveLength(2);
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
    });
  });

  it('UPDATE_LABEL_KEY, UPDATE_LABEL_VALUE, and REMOVE_LABEL sync labels on the CR', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    expect(state.labels).toHaveLength(2);

    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'forWorkQueue' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'true' },
    });

    expect(state.labels[1]).toEqual({ key: 'forWorkQueue', value: 'true' });
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
      forWorkQueue: 'true',
    });

    state = brokerServiceReducer(state, { type: 'REMOVE_LABEL', payload: 1 });

    expect(state.labels).toEqual([
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
    });
  });

  it('REMOVE_LABEL removes the label from CR metadata labels', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'forWorkQueue' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'true' },
    });

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 2, key: 'app' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 2, value: 'messaging' },
    });

    expect(state.labels).toEqual([
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
      { key: 'forWorkQueue', value: 'true' },
      { key: 'app', value: 'messaging' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
      forWorkQueue: 'true',
      app: 'messaging',
    });

    state = brokerServiceReducer(state, { type: 'REMOVE_LABEL', payload: 1 });

    expect(state.labels).toEqual([
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
      { key: 'app', value: 'messaging' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
      app: 'messaging',
    });
  });

  it('uses the first value when duplicate label keys are synced to the CR', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 1, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'test' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 2, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 2, value: 'some-value' },
    });

    expect(state.labels).toEqual([
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
      { key: 'key1', value: 'test' },
      { key: 'key1', value: 'some-value' },
    ]);
    expect(state.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
      key1: 'test',
    });
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
      payload: { index: 1, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 1, value: 'value1' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 2, key: 'key1' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 2, value: 'value2' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 3, key: 'key2' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 3, value: 'something' },
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
      { key: 'app.kubernetes.io/instance', value: 'my-messaging-service' },
      { key: 'key1', value: 'value1' },
      { key: 'key1', value: 'value2' },
      { key: 'key2', value: 'something' },
      { key: 'key3', value: 'test' },
    ]);
    expect(next.cr.metadata?.labels).toEqual({
      'app.kubernetes.io/instance': 'my-messaging-service',
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

    expect(next.cr).toEqual(newCr);
    expect(next.cr).not.toBe(newCr);
    expect(next.labels).toEqual([
      { key: 'forWorkQueue', value: 'true' },
      { key: 'app', value: 'messaging' },
    ]);
    expect(next.memoryValue).toBe('512');
    expect(next.memoryUnit).toBe('Mi');
  });

  it('SET_MODEL removes newly added label rows after reload', () => {
    const clusterCr: BrokerService = {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: {
        name: 'broker',
        namespace: TEST_NAMESPACE,
        labels: { app: 'messaging', env: 'prod' },
      },
      spec: { resources: { limits: { memory: '2Gi' } } },
    };
    let state = createBrokerServiceStateFromCr(clusterCr);
    state = brokerServiceReducer(state, { type: 'ADD_LABEL' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_KEY',
      payload: { index: 2, key: 'team' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_LABEL_VALUE',
      payload: { index: 2, value: 'platform' },
    });

    expect(state.labels).toHaveLength(3);

    const reloaded = brokerServiceReducer(state, { type: 'SET_MODEL', payload: clusterCr });

    expect(reloaded.labels).toEqual([
      { key: 'app', value: 'messaging' },
      { key: 'env', value: 'prod' },
    ]);
  });

  it('SET_MODEL discards in-memory edits and does not mutate the cluster baseline object', () => {
    const clusterCr: BrokerService = {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: {
        name: 'broker',
        namespace: TEST_NAMESPACE,
        labels: { app: 'messaging' },
      },
      spec: { resources: { limits: { memory: '2Gi' } } },
    };
    let state = createBrokerServiceStateFromCr(clusterCr);
    state = brokerServiceReducer(state, { type: 'SET_MEMORY_VALUE', payload: '8' });
    expect(state.memoryValue).toBe('8');

    const reloaded = brokerServiceReducer(state, { type: 'SET_MODEL', payload: clusterCr });

    expect(reloaded.memoryValue).toBe('2');
    expect(reloaded.cr.spec?.resources?.limits?.memory).toBe('2Gi');
    expect(clusterCr.spec?.resources?.limits?.memory).toBe('2Gi');
  });

  it('ADD_ENV_VAR does not add empty-name entries to CR spec.env', () => {
    let state = createState();
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });

    expect(state.envVars).toHaveLength(1);
    expect(state.cr.spec?.env).toBeUndefined();
  });

  it('ADD_ENV_VAR never assigns the same id twice, even back-to-back', () => {
    let state = createState();
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });

    const ids = state.envVars.map((envVar) => envVar.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('UPDATE_ENV_VAR_NAME and UPDATE_ENV_VAR_VALUE sync env vars onto the CR', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 0, name: 'BROKER_MAX_CONNECTIONS' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_VALUE',
      payload: { index: 0, value: '1000' },
    });

    expect(state.envVars[0]).toMatchObject({ name: 'BROKER_MAX_CONNECTIONS', value: '1000' });
    expect(state.cr.spec?.env).toEqual([{ name: 'BROKER_MAX_CONNECTIONS', value: '1000' }]);
  });

  it('REMOVE_ENV_VAR removes the entry from state and CR spec.env', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 0, name: 'first' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 1, name: 'second' },
    });

    expect(state.cr.spec?.env).toEqual([
      { name: 'first', value: '' },
      { name: 'second', value: '' },
    ]);

    state = brokerServiceReducer(state, { type: 'REMOVE_ENV_VAR', payload: 0 });

    expect(state.envVars).toHaveLength(1);
    expect(state.envVars[0]).toMatchObject({ name: 'second', value: '' });
    expect(state.cr.spec?.env).toEqual([{ name: 'second', value: '' }]);
  });

  it('REMOVE_ENV_VAR at index 0 preserves the second entry id', () => {
    // Checks that a row keeps its own id even after an earlier row is removed and its
    // index changes.
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 0, name: 'first' },
    });
    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 1, name: 'second' },
    });
    const secondId = state.envVars[1].id;

    state = brokerServiceReducer(state, { type: 'REMOVE_ENV_VAR', payload: 0 });

    expect(state.envVars).toHaveLength(1);
    expect(state.envVars[0]).toMatchObject({ id: secondId, name: 'second', value: '' });
  });

  it('drops env var rows with a blank name from CR spec.env while keeping them in form state', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_VALUE',
      payload: { index: 0, value: 'orphaned-value' },
    });

    expect(state.envVars).toHaveLength(1);
    expect(state.envVars[0]).toMatchObject({ name: '', value: 'orphaned-value' });
    expect(state.cr.spec?.env).toBeUndefined();
  });

  it('treats a whitespace-only env var name as blank, dropping it from CR spec.env', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 0, name: '   ' },
    });

    expect(state.envVars[0]).toMatchObject({ name: '   ', value: '' });
    expect(state.cr.spec?.env).toBeUndefined();
  });

  it('trims leading and trailing whitespace from env var names before writing to CR spec.env', () => {
    let state = createState();

    state = brokerServiceReducer(state, { type: 'ADD_ENV_VAR' });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_NAME',
      payload: { index: 0, name: '  BROKER_HOST  ' },
    });
    state = brokerServiceReducer(state, {
      type: 'UPDATE_ENV_VAR_VALUE',
      payload: { index: 0, value: 'localhost' },
    });

    // Form state keeps the raw value the user typed, including whitespace.
    expect(state.envVars[0]).toMatchObject({ name: '  BROKER_HOST  ', value: 'localhost' });
    // The CR only ever receives the trimmed name.
    expect(state.cr.spec?.env).toEqual([{ name: 'BROKER_HOST', value: 'localhost' }]);
  });

  it('SET_MODEL populates envVars from an existing CR spec.env', () => {
    const state = createState();
    const newCr: BrokerService = {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: { name: 'updated-broker', namespace: TEST_NAMESPACE },
      spec: {
        resources: { limits: { memory: '2Gi' } },
        env: [{ name: 'BROKER_MAX_CONNECTIONS', value: '1000' }],
      },
    };

    const next = brokerServiceReducer(state, { type: 'SET_MODEL', payload: newCr });

    expect(next.envVars).toHaveLength(1);
    expect(next.envVars[0]).toMatchObject({ name: 'BROKER_MAX_CONNECTIONS', value: '1000' });
    expect(next.cr.spec?.env).toEqual([{ name: 'BROKER_MAX_CONNECTIONS', value: '1000' }]);
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

describe('SET_MODEL validation', () => {
  it('returns current state when yaml is provided and CR has an invalid name', () => {
    const yaml =
      'apiVersion: broker.arkmq.org/v1beta2\nkind: BrokerService\nmetadata:\n  name: INVALID\n  namespace: test-ns\nspec:\n  resources:\n    limits:\n      memory: 2Gi\n';
    const initial = createState();
    const result = brokerServiceReducer(initial, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerService',
        metadata: { name: 'INVALID', namespace: 'test-ns' },
        spec: { resources: { limits: { memory: '2Gi' } } },
      },
      yaml,
    });
    expect(result).toBe(initial);
  });

  it('returns current state when yaml is provided and CR has invalid memory format', () => {
    const yaml =
      'apiVersion: broker.arkmq.org/v1beta2\nkind: BrokerService\nmetadata:\n  name: valid\n  namespace: test-ns\nspec:\n  resources:\n    limits:\n      memory: 2Ti\n';
    const initial = createState();
    const result = brokerServiceReducer(initial, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerService',
        metadata: { name: 'valid', namespace: 'test-ns' },
        spec: { resources: { limits: { memory: '2Ti' } } },
      },
      yaml,
    });
    expect(result).toBe(initial);
  });

  it('returns current state when yaml is provided and spec.env has duplicate names', () => {
    const yaml = [
      'apiVersion: broker.arkmq.org/v1beta2',
      'kind: BrokerService',
      'metadata:',
      '  name: valid',
      '  namespace: test-ns',
      'spec:',
      '  resources:',
      '    limits:',
      '      memory: 2Gi',
      '  env:',
      '    - name: BROKER_LOG_LEVEL',
      '      value: debug',
      '    - name: BROKER_LOG_LEVEL',
      '      value: info',
    ].join('\n');
    const initial = createState();
    const result = brokerServiceReducer(initial, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerService',
        metadata: { name: 'valid', namespace: 'test-ns' },
        spec: {
          resources: { limits: { memory: '2Gi' } },
          env: [
            { name: 'BROKER_LOG_LEVEL', value: 'debug' },
            { name: 'BROKER_LOG_LEVEL', value: 'info' },
          ],
        },
      },
      yaml,
    });
    expect(result).toBe(initial);
  });

  it('does not throw when yaml is provided and CR is valid', () => {
    const yaml =
      'apiVersion: broker.arkmq.org/v1beta2\nkind: BrokerService\nmetadata:\n  name: valid\n  namespace: test-ns\nspec:\n  resources:\n    limits:\n      memory: 2Gi\n';
    expect(() =>
      brokerServiceReducer(createState(), {
        type: 'SET_MODEL',
        payload: {
          apiVersion: 'broker.arkmq.org/v1beta2',
          kind: 'BrokerService',
          metadata: { name: 'valid', namespace: 'test-ns' },
          spec: { resources: { limits: { memory: '2Gi' } } },
        },
        yaml,
      }),
    ).not.toThrow();
  });

  it('does not validate when yaml is not provided (cluster reload)', () => {
    expect(() =>
      brokerServiceReducer(createState(), {
        type: 'SET_MODEL',
        payload: {
          apiVersion: 'broker.arkmq.org/v1beta2',
          kind: 'BrokerService',
          metadata: { name: 'INVALID', namespace: 'test-ns' },
          spec: { resources: { limits: { memory: '2Ti' } } },
        },
      }),
    ).not.toThrow();
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
