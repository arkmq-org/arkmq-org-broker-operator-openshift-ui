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

  it('SET_NAME updates the CR metadata name', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_NAME', payload: 'my-broker-app' });

    expect(state.cr.metadata?.name).toBe('my-broker-app');
    expect(state.cr.metadata?.namespace).toBe(ns);
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

  describe('hasChanges tracking', () => {
    it('starts with hasChanges false', () => {
      const state = createInitialBrokerAppState(ns);
      expect(state.hasChanges).toBe(false);
    });

    it('SET_NAME sets hasChanges to true', () => {
      const state = brokerAppReducer(createInitialBrokerAppState(ns), {
        type: 'SET_NAME',
        payload: 'new-name',
      });
      expect(state.hasChanges).toBe(true);
    });

    it('ADD_ADDRESS sets hasChanges to true', () => {
      const state = brokerAppReducer(createInitialBrokerAppState(ns), {
        type: 'ADD_ADDRESS',
      });
      expect(state.hasChanges).toBe(true);
    });

    it('REMOVE_ADDRESS sets hasChanges to true', () => {
      let state = createInitialBrokerAppState(ns);
      state = brokerAppReducer(state, { type: 'ADD_ADDRESS' });
      state = brokerAppReducer(state, {
        type: 'SET_MODEL',
        payload: state.cr,
        resetChanges: true,
      });
      expect(state.hasChanges).toBe(false);

      state = brokerAppReducer(state, {
        type: 'REMOVE_ADDRESS',
        payload: { index: 0 },
      });
      expect(state.hasChanges).toBe(true);
    });

    it('ADD_MATCH_LABEL sets hasChanges to true', () => {
      const state = brokerAppReducer(createInitialBrokerAppState(ns), {
        type: 'ADD_MATCH_LABEL',
      });
      expect(state.hasChanges).toBe(true);
    });

    it('REMOVE_MATCH_LABEL sets hasChanges to true', () => {
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
      state = brokerAppReducer(state, {
        type: 'SET_MODEL',
        payload: state.cr,
        resetChanges: true,
      });
      expect(state.hasChanges).toBe(false);
      expect(state.matchLabels).toHaveLength(2);

      state = brokerAppReducer(state, {
        type: 'REMOVE_MATCH_LABEL',
        payload: state.matchLabels[1].id,
      });
      expect(state.hasChanges).toBe(true);
    });

    it('UPDATE_MATCH_LABEL sets hasChanges to true', () => {
      const initial = createInitialBrokerAppState(ns);
      const state = brokerAppReducer(initial, {
        type: 'UPDATE_MATCH_LABEL',
        payload: { id: initial.matchLabels[0].id, key: 'env', value: 'prod' },
      });
      expect(state.hasChanges).toBe(true);
    });

    it('SET_MODEL with resetChanges resets hasChanges to false', () => {
      let state = createInitialBrokerAppState(ns);
      state = brokerAppReducer(state, { type: 'SET_NAME', payload: 'edited' });
      expect(state.hasChanges).toBe(true);

      state = brokerAppReducer(state, {
        type: 'SET_MODEL',
        payload: state.cr,
        resetChanges: true,
      });
      expect(state.hasChanges).toBe(false);
    });

    it('SET_MODEL without resetChanges sets hasChanges to true', () => {
      const state = brokerAppReducer(createInitialBrokerAppState(ns), {
        type: 'SET_MODEL',
        payload: {
          apiVersion: 'broker.arkmq.org/v1beta2',
          kind: 'BrokerApp',
          metadata: { name: 'from-yaml', namespace: ns },
          spec: {},
        },
      });
      expect(state.hasChanges).toBe(true);
    });
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
    expect(state.addresses).toHaveLength(1);
    expect(state.addresses[0]).toEqual({
      address: '',
      ownership: 'private',
      direction: 'produces',
    });
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

  it('removes cleared resource fields and cleans up empty parent objects', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '250m' });
    state = brokerAppReducer(state, { type: 'SET_MEMORY_REQUEST', payload: '256Mi' });
    state = brokerAppReducer(state, { type: 'SET_CPU_REQUEST', payload: '' });

    expect(state.cr.spec.resources?.requests?.cpu).toBeUndefined();
    expect(state.cr.spec.resources?.requests?.memory).toBe('256Mi');

    state = brokerAppReducer(state, { type: 'SET_MEMORY_REQUEST', payload: '' });
    expect(state.cr.spec.resources).toBeUndefined();
  });

  it('removes cleared limit fields and cleans up empty parent objects', () => {
    let state = createInitialBrokerAppState(ns);
    state = brokerAppReducer(state, { type: 'SET_CPU_LIMIT', payload: '500m' });
    state = brokerAppReducer(state, { type: 'SET_MEMORY_LIMIT', payload: '512Mi' });
    state = brokerAppReducer(state, { type: 'SET_CPU_LIMIT', payload: '' });

    expect(state.cr.spec.resources?.limits?.cpu).toBeUndefined();
    expect(state.cr.spec.resources?.limits?.memory).toBe('512Mi');

    state = brokerAppReducer(state, { type: 'SET_MEMORY_LIMIT', payload: '' });
    expect(state.cr.spec.resources).toBeUndefined();
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

const applyActions = (
  ...actions: Parameters<typeof brokerAppReducer>[1][]
): ReturnType<typeof brokerAppReducer> =>
  actions.reduce((s, a) => brokerAppReducer(s, a), createInitialBrokerAppState('test-ns'));

const makeCR = (name: string, spec = {}) => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace: 'test-ns' },
  spec,
});

describe('address reducer actions', () => {
  beforeEach(() => {
    let nowCounter = 0;
    jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initial state includes one blank address entry', () => {
    const state = createInitialBrokerAppState('test-ns');
    expect(state.addresses).toHaveLength(1);
    expect(state.addresses[0]).toEqual({
      address: '',
      ownership: 'private',
      direction: 'produces',
    });
  });

  it('ADD_ADDRESS appends a blank entry with default ownership and direction', () => {
    const state = applyActions({ type: 'ADD_ADDRESS' });
    expect(state.addresses).toHaveLength(2);
    expect(state.addresses[1]).toEqual({
      address: '',
      ownership: 'private',
      direction: 'produces',
    });
  });

  it('ADD_ADDRESS blank entries are excluded from spec', () => {
    const state = applyActions({ type: 'ADD_ADDRESS' });
    expect(state.cr.spec.addresses).toBeUndefined();
    expect(state.cr.spec.capabilities).toBeUndefined();
  });

  it('REMOVE_ADDRESS removes the correct entry by index', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'REMOVE_ADDRESS', payload: { index: 0 } },
    );
    expect(state.addresses).toHaveLength(1);
  });

  it('REMOVE_ADDRESS at index 0 preserves the second entry at index 0', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'first' } },
      { type: 'UPDATE_ADDRESS', payload: { index: 1, address: 'second' } },
      { type: 'REMOVE_ADDRESS', payload: { index: 0 } },
    );
    expect(state.addresses).toHaveLength(1);
    expect(state.addresses[0].address).toBe('second');
  });

  it('UPDATE_ADDRESS updates the address name and syncs to spec', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'orders.private' } },
    );
    expect(state.cr.spec.addresses).toEqual([{ address: 'orders.private' }]);
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toEqual([{ address: 'orders.private' }]);
  });

  it('UPDATE_ADDRESS ownership to shared writes to spec.sharedAddresses', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'events.shared', ownership: 'shared' },
      },
    );
    expect(state.cr.spec.addresses).toBeUndefined();
    expect(state.cr.spec.sharedAddresses).toEqual([{ address: 'events.shared' }]);
  });

  it('UPDATE_ADDRESS ownership to external only writes capabilities, not addresses', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'external.queue', ownership: 'external' },
      },
    );
    expect(state.cr.spec.addresses).toBeUndefined();
    expect(state.cr.spec.sharedAddresses).toBeUndefined();
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toEqual([{ address: 'external.queue' }]);
  });

  it('UPDATE_ADDRESS ownership to external clears pubSub and subscriptions', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'topic', pubSub: true, subscriptions: ['sub-a'] },
      },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, ownership: 'external' } },
    );
    expect(state.addresses[0].pubSub).toBeUndefined();
    expect(state.addresses[0].subscriptions).toBeUndefined();
  });

  it('UPDATE_ADDRESS direction to consumes writes to consumerOf', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'payments', direction: 'consumes' } },
    );
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toBeUndefined();
    expect(state.cr.spec.capabilities?.[0]?.consumerOf).toEqual([{ address: 'payments' }]);
  });

  it('UPDATE_ADDRESS direction to both writes to both producerOf and consumerOf', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'events', direction: 'both' } },
    );
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toEqual([{ address: 'events' }]);
    expect(state.cr.spec.capabilities?.[0]?.consumerOf).toEqual([{ address: 'events' }]);
  });

  it('UPDATE_ADDRESS pubSub toggle is reflected in spec.addresses', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'events.topic', pubSub: true } },
    );
    expect(state.cr.spec.addresses).toEqual([{ address: 'events.topic', pubSub: true }]);
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toEqual([
      { address: 'events.topic', pubSub: true },
    ]);
  });

  it('pubSub and subscriptions are propagated to consumerOf but not producerOf', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'events.topic', pubSub: true, direction: 'both' },
      },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, subscriptions: ['sub-a'] },
      },
    );
    expect(state.cr.spec.capabilities?.[0]?.producerOf).toEqual([
      { address: 'events.topic', pubSub: true },
    ]);
    expect(state.cr.spec.capabilities?.[0]?.consumerOf).toEqual([
      { address: 'events.topic', pubSub: true, subscriptions: ['sub-a'] },
    ]);
  });

  it('toggling pubSub off clears subscriptions from form state and spec', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'events.topic', pubSub: true, subscriptions: ['sub-a'] },
      },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, pubSub: false } },
    );
    expect(state.addresses[0].subscriptions).toBeUndefined();
    expect(state.cr.spec.addresses?.[0]).not.toHaveProperty('pubSub');
    expect(state.cr.spec.addresses?.[0]).not.toHaveProperty('subscriptions');
  });

  it('spec.addresses omits pubSub and subscriptions when not set', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'queue.plain' } },
    );
    const entry = state.cr.spec.addresses?.[0];
    expect(entry).not.toHaveProperty('pubSub');
    expect(entry).not.toHaveProperty('subscriptions');
  });

  it('spec.addresses is undefined when all entries are whitespace-only', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: '   ' } },
    );
    expect(state.cr.spec.addresses).toBeUndefined();
  });

  it('spec.addresses trims whitespace from address values', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: '  orders.private  ' } },
    );
    expect(state.cr.spec.addresses).toEqual([{ address: 'orders.private' }]);
  });

  it('direction none excludes address from capabilities but keeps it in spec.addresses', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, address: 'shared.queue', direction: 'none' },
      },
    );
    expect(state.cr.spec.addresses).toEqual([{ address: 'shared.queue' }]);
    expect(state.cr.spec.capabilities).toBeUndefined();
  });

  it('capabilities is deleted when no addresses have direction', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'queue' } },
      { type: 'REMOVE_ADDRESS', payload: { index: 0 } },
    );
    expect(state.cr.spec.capabilities).toBeUndefined();
  });
});

describe('subscription via UPDATE_ADDRESS', () => {
  beforeEach(() => {
    let nowCounter = 0;
    jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('UPDATE_ADDRESS with subscriptions writes them to spec.addresses', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: {
          index: 0,
          address: 'events.topic',
          pubSub: true,
          subscriptions: ['sub-a', 'sub-b'],
        },
      },
    );
    expect(state.cr.spec.addresses).toEqual([
      { address: 'events.topic', pubSub: true, subscriptions: ['sub-a', 'sub-b'] },
    ]);
  });

  it('UPDATE_ADDRESS with subscriptions does not mutate other address entries', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      { type: 'ADD_ADDRESS' },
      { type: 'UPDATE_ADDRESS', payload: { index: 0, address: 'events.topic', pubSub: true } },
      { type: 'UPDATE_ADDRESS', payload: { index: 1, address: 'other.topic', pubSub: true } },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, subscriptions: ['sub-a'] },
      },
    );
    expect(state.addresses[1].subscriptions).toBeUndefined();
  });

  it('UPDATE_ADDRESS replaces subscriptions atomically', () => {
    const state = applyActions(
      { type: 'ADD_ADDRESS' },
      {
        type: 'UPDATE_ADDRESS',
        payload: {
          index: 0,
          address: 'events.topic',
          pubSub: true,
          subscriptions: ['sub-a', 'sub-b'],
        },
      },
      {
        type: 'UPDATE_ADDRESS',
        payload: { index: 0, subscriptions: ['sub-b'] },
      },
    );
    expect(state.addresses[0].subscriptions).toEqual(['sub-b']);
    expect(state.cr.spec.addresses?.[0].subscriptions).toEqual(['sub-b']);
  });
});

describe('SET_MODEL hydration', () => {
  beforeEach(() => {
    let nowCounter = 0;
    jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hydrates private addresses from spec.addresses', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        addresses: [
          { address: 'orders.private', pubSub: false },
          { address: 'events.topic', pubSub: true, subscriptions: ['sub-a'] },
        ],
      }),
    });
    expect(state.addresses).toHaveLength(2);
    expect(state.addresses[0]).toMatchObject({
      address: 'orders.private',
      ownership: 'private',
      direction: 'none',
    });
    expect(state.addresses[1]).toMatchObject({
      address: 'events.topic',
      ownership: 'private',
      direction: 'none',
      pubSub: true,
      subscriptions: ['sub-a'],
    });
  });

  it('hydrates shared addresses from spec.sharedAddresses', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        sharedAddresses: [{ address: 'shared.topic', pubSub: true }],
      }),
    });
    expect(state.addresses).toHaveLength(1);
    expect(state.addresses[0]).toMatchObject({
      address: 'shared.topic',
      ownership: 'shared',
      direction: 'none',
      pubSub: true,
    });
  });

  it('hydrates external addresses from capabilities not in addresses/sharedAddresses', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        capabilities: [{ consumerOf: [{ address: 'external.queue' }] }],
      }),
    });
    expect(state.addresses).toHaveLength(1);
    expect(state.addresses[0]).toMatchObject({
      address: 'external.queue',
      ownership: 'external',
      direction: 'consumes',
    });
  });

  it('merges direction from capabilities onto private addresses', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        addresses: [{ address: 'orders' }],
        capabilities: [{ consumerOf: [{ address: 'orders' }] }],
      }),
    });
    expect(state.addresses[0]).toMatchObject({
      address: 'orders',
      ownership: 'private',
      direction: 'consumes',
    });
  });

  it('resolves direction to both when address is in producerOf and consumerOf', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        addresses: [{ address: 'events' }],
        capabilities: [
          {
            producerOf: [{ address: 'events' }],
            consumerOf: [{ address: 'events' }],
          },
        ],
      }),
    });
    expect(state.addresses[0].direction).toBe('both');
  });

  it('hydrates all three sources together', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        addresses: [{ address: 'private.queue' }],
        sharedAddresses: [{ address: 'shared.topic', pubSub: true }],
        capabilities: [
          {
            producerOf: [{ address: 'private.queue' }, { address: 'external.out' }],
            consumerOf: [{ address: 'shared.topic' }],
          },
        ],
      }),
    });
    expect(state.addresses).toHaveLength(3);
    expect(state.addresses[0]).toMatchObject({
      address: 'private.queue',
      ownership: 'private',
      direction: 'produces',
    });
    expect(state.addresses[1]).toMatchObject({
      address: 'shared.topic',
      ownership: 'shared',
      direction: 'consumes',
      pubSub: true,
    });
    expect(state.addresses[2]).toMatchObject({
      address: 'external.out',
      ownership: 'external',
      direction: 'produces',
    });
  });

  it('SET_MODEL populates matchLabels from spec', () => {
    const state = applyActions({
      type: 'SET_MODEL',
      payload: makeCR('imported', {
        selector: { matchLabels: { env: 'prod', tier: 'web' } },
      }),
    });
    expect(state.matchLabels.map(({ key, value }) => ({ key, value }))).toEqual(
      expect.arrayContaining([
        { key: 'env', value: 'prod' },
        { key: 'tier', value: 'web' },
      ]),
    );
  });
});
