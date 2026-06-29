import { renderHook } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
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

  it('ADD_ADDRESS builds consumerOf and subscriberOf in spec', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'consumerOf',
      payload: 'QUEUE.PAYMENTS',
    });
    state = brokerAppReducer(state, {
      type: 'ADD_ADDRESS',
      field: 'subscriberOf',
      payload: 'TOPIC.EVENTS',
    });

    const cap = state.cr.spec.capabilities?.[0] ?? {};
    expect(cap.consumerOf?.map((a) => a.address)).toContain('QUEUE.PAYMENTS');
    expect(cap.subscriberOf?.map((a) => a.address)).toContain('TOPIC.EVENTS');
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
    expect(next.producerOf).toEqual(['QUEUE.OUT']);
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
    expect(state.producerOf).toHaveLength(1);
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
              subscriberOf: [{ address: 'TOPIC.EVENTS' }],
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
    expect(state.producerOf).toEqual(['QUEUE.OUT']);
    expect(state.consumerOf).toEqual(['QUEUE.IN']);
    expect(state.subscriberOf).toEqual(['TOPIC.EVENTS']);
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
    expect(state.producerOf).toEqual([]);
    expect(state.consumerOf).toEqual([]);
    expect(state.subscriberOf).toEqual([]);
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
