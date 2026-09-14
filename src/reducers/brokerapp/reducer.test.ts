import { renderHook } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
  getAddresses,
} from './reducer';

describe('brokerAppReducer', () => {
  const ns = 'test-ns';

  let nowCounter = 0;

  beforeEach(() => {
    nowCounter = 0;
    jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ADD_ADDRESS builds multiple producerOf addresses in spec', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.A',
    });
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.B',
    });
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.C',
    });

    const producerOf = state.cr.spec.capabilities?.[0]?.producerOf ?? [];
    expect(producerOf).toHaveLength(3);
    expect(producerOf.map((p) => p.address)).toEqual(
      expect.arrayContaining(['QUEUE.A', 'QUEUE.B', 'QUEUE.C']),
    );
  });

  it('REMOVE_ADDRESS removes the address from spec', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.KEEP',
    });
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.REMOVE',
    });
    state = brokerAppReducer(state, {
      type: 'REMOVE_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.REMOVE',
    });

    const producerOf = state.cr.spec.capabilities?.[0]?.producerOf ?? [];
    expect(producerOf.map((p) => p.address)).toEqual(['QUEUE.KEEP']);
  });

  it('ADD_ADDRESS builds consumerOf in spec', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'consumerOf',
      payload: 'QUEUE.PAYMENTS',
    });

    const cap = state.cr.spec.capabilities?.[0] ?? {};
    expect(cap.consumerOf?.map((a) => a.address)).toContain('QUEUE.PAYMENTS');
  });

  it('REMOVE_MATCH_LABEL removes the label from spec.selector.matchLabels', () => {
    let state = createInitialBrokerAppState(ns);
    const id1 = state.matchLabels[0].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id1, key: 'env', value: 'prod' },
    });
    state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
    const id2 = state.matchLabels[1].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id2, key: 'tier', value: 'web' },
    });
    state = brokerAppReducer(state, { type: 'REMOVE_MATCH_LABEL', payload: id1 });

    const matchLabels = state.cr.spec.selector?.matchLabels ?? {};
    expect(matchLabels).toEqual({ tier: 'web' });
  });

  it('uses the first value when duplicate match label keys are synced to the CR', () => {
    let state = createInitialBrokerAppState(ns);
    const id1 = state.matchLabels[0].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id1, key: 'key1', value: 'test' },
    });
    state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
    const id2 = state.matchLabels[1].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id2, key: 'key1', value: 'some-value' },
    });

    expect(state.matchLabels.map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'key1', value: 'test' },
      { key: 'key1', value: 'some-value' },
    ]);
    expect(state.cr.spec.selector?.matchLabels).toEqual({ key1: 'test' });
  });

  it('SET_MODEL with preserveLabels keeps form match label rows when duplicates exist', () => {
    let state = createInitialBrokerAppState(ns);
    const id1 = state.matchLabels[0].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id1, key: 'key1', value: 'test' },
    });
    state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
    const id2 = state.matchLabels[1].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id2, key: 'key1', value: 'some-value' },
    });

    const next = brokerAppReducer(state, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'from-yaml', namespace: ns },
        spec: {
          selector: { matchLabels: { key1: 'test' } },
          capabilities: [{ producerOf: [{ address: 'QUEUE.OUT' }] }],
        },
      },
      preserveLabels: true,
    });

    expect(next.matchLabels).toEqual(state.matchLabels);
    expect(next.cr.spec.selector?.matchLabels).toEqual({ key1: 'test' });
    expect(next.cr.metadata?.name).toBe('from-yaml');
    expect(getAddresses(next.cr, 'producerOf')).toEqual(['QUEUE.OUT']);
  });

  it('SET_MODEL with preserveLabels merges new YAML-only match label keys into form rows', () => {
    let state = createInitialBrokerAppState(ns);
    const id1 = state.matchLabels[0].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id1, key: 'key1', value: 'value1' },
    });
    state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
    const id2 = state.matchLabels[1].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id2, key: 'key1', value: 'value2' },
    });
    state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
    const id3 = state.matchLabels[2].id;
    state = brokerAppReducer(state, {
      type: 'UPDATE_MATCH_LABEL',
      payload: { id: id3, key: 'key2', value: 'something' },
    });

    const next = brokerAppReducer(state, {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'from-yaml', namespace: ns },
        spec: {
          selector: { matchLabels: { key1: 'value1', key2: 'something', key3: 'test' } },
          capabilities: [{ producerOf: [{ address: 'QUEUE.OUT' }] }],
        },
      },
      preserveLabels: true,
    });

    expect(next.matchLabels.slice(0, 3).map(({ key, value }) => ({ key, value }))).toEqual([
      { key: 'key1', value: 'value1' },
      { key: 'key1', value: 'value2' },
      { key: 'key2', value: 'something' },
    ]);
    expect(next.matchLabels[3]).toMatchObject({ key: 'key3', value: 'test' });
    expect(next.cr.spec.selector?.matchLabels).toEqual({
      key1: 'value1',
      key2: 'something',
      key3: 'test',
    });
  });

  it('SET_NAME updates the CR metadata name', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_NAME', payload: 'my-broker-app' });

    expect(state.cr.metadata?.name).toBe('my-broker-app');
    expect(state.cr.metadata?.namespace).toBe(ns);
  });

  it('ADD_ADDRESS ignores a duplicate address', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.DUPE',
    });
    const stateBeforeDupe = state;
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'producerOf',
      payload: 'QUEUE.DUPE',
    });

    expect(state).toBe(stateBeforeDupe);
    expect(getAddresses(state.cr, 'producerOf')).toHaveLength(1);
  });

  it('SET_MODEL populates matchLabels and address fields from an existing CR', () => {
    const state = brokerAppReducer(createInitialBrokerAppState(ns), {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'imported', namespace: ns },
        spec: {
          selector: { matchLabels: { env: 'prod', tier: 'web' } },
          capabilities: [
            {
              producerOf: [{ address: 'QUEUE.OUT' }],
              consumerOf: [{ address: 'QUEUE.IN' }],
            },
          ],
        },
      },
    });

    expect(state.matchLabels.map(({ key, value }) => ({ key, value }))).toEqual(
      expect.arrayContaining([
        { key: 'env', value: 'prod' },
        { key: 'tier', value: 'web' },
      ]),
    );
    expect(getAddresses(state.cr, 'producerOf')).toEqual(['QUEUE.OUT']);
    expect(getAddresses(state.cr, 'consumerOf')).toEqual(['QUEUE.IN']);
  });

  it('SET_MODEL with empty spec produces a single blank matchLabel row', () => {
    const state = brokerAppReducer(createInitialBrokerAppState(ns), {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'empty', namespace: ns },
        spec: {},
      },
    });

    expect(state.matchLabels).toHaveLength(1);
    expect(state.matchLabels[0].key).toBe('');
    expect(state.matchLabels[0].value).toBe('');
    expect(getAddresses(state.cr, 'producerOf')).toEqual([]);
    expect(getAddresses(state.cr, 'consumerOf')).toEqual([]);
  });
});

describe('brokerAppReducer resource fields', () => {
  const ns = 'test-ns';

  it('SET_CPU_REQUEST writes spec.resources.requests.cpu', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '250m' });

    expect(state.cr.spec.resources?.requests?.cpu).toBe('250m');
  });

  it('SET_CPU_LIMIT writes spec.resources.limits.cpu', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_LIMIT', payload: '500m' });

    expect(state.cr.spec.resources?.limits?.cpu).toBe('500m');
  });

  it('SET_MEMORY_REQUEST writes spec.resources.requests.memory', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_MEMORY_REQUEST', payload: '256Mi' });

    expect(state.cr.spec.resources?.requests?.memory).toBe('256Mi');
  });

  it('SET_MEMORY_LIMIT writes spec.resources.limits.memory', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_MEMORY_LIMIT', payload: '512Mi' });

    expect(state.cr.spec.resources?.limits?.memory).toBe('512Mi');
  });

  it('sets cleared resource values to undefined without affecting other fields', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '250m' });
    state = brokerAppReducer(state, { type: 'SET_MEMORY_REQUEST', payload: '256Mi' });
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '' });

    expect(state.cr.spec.resources?.requests?.cpu).toBeUndefined();
    expect(state.cr.spec.resources?.requests?.memory).toBe('256Mi');
  });

  it('only includes requests when only request fields are set', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '500m' });

    expect(state.cr.spec.resources?.requests?.cpu).toBe('500m');
    expect(state.cr.spec.resources?.limits).toBeUndefined();
  });

  it('only includes limits when only limit fields are set', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_MEMORY_LIMIT', payload: '2Gi' });

    expect(state.cr.spec.resources?.limits?.memory).toBe('2Gi');
    expect(state.cr.spec.resources?.requests).toBeUndefined();
  });

  it('builds all four fields together correctly', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '250m' });
    state = brokerAppReducer(state, { type: 'SET_CPU_LIMIT', payload: '500m' });
    state = brokerAppReducer(state, { type: 'SET_MEMORY_REQUEST', payload: '256Mi' });
    state = brokerAppReducer(state, { type: 'SET_MEMORY_LIMIT', payload: '512Mi' });

    expect(state.cr.spec.resources).toEqual({
      requests: { cpu: '250m', memory: '256Mi' },
      limits: { cpu: '500m', memory: '512Mi' },
    });
  });

  it('SET_MODEL preserves resource values from the incoming CR', () => {
    const state = brokerAppReducer(createInitialBrokerAppState(ns), {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'imported', namespace: ns },
        spec: {
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '200m', memory: '256Mi' },
          },
        },
      },
    });

    expect(state.cr.spec.resources?.requests?.cpu).toBe('100m');
    expect(state.cr.spec.resources?.limits?.cpu).toBe('200m');
    expect(state.cr.spec.resources?.requests?.memory).toBe('128Mi');
    expect(state.cr.spec.resources?.limits?.memory).toBe('256Mi');
  });

  it('SET_MODEL with no resources leaves spec.resources undefined', () => {
    const state = brokerAppReducer(createInitialBrokerAppState(ns), {
      type: 'SET_MODEL',
      payload: {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        metadata: { name: 'no-resources', namespace: ns },
        spec: {},
      },
    });

    expect(state.cr.spec.resources).toBeUndefined();
  });
});

describe('broker app hooks', () => {
  it('useBrokerAppFormState throws when used outside its Provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useBrokerAppFormState())).toThrow(
      'useBrokerAppFormState must be used inside BrokerAppFormStateContext.Provider',
    );
    jest.restoreAllMocks();
  });

  it('useBrokerAppFormDispatch throws when used outside its Provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useBrokerAppFormDispatch())).toThrow(
      'useBrokerAppFormDispatch must be used inside BrokerAppFormDispatchContext.Provider',
    );
    jest.restoreAllMocks();
  });
});
