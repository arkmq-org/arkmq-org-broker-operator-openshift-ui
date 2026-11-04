import type { Address } from '../../../reducers/brokerapp/reducer';
import { connectionAction } from './dataflowConnections';

const self = { namespace: 'default', name: 'my-app' };
const addresses: Address[] = [
  { address: 'orders', kind: 'owned', direction: 'none' },
  { address: 'events', kind: 'owned', direction: 'consumes' },
  { address: 'remote', kind: 'referenced', direction: 'produces', appName: 'o', appNamespace: 'n' },
];

describe('connectionAction', () => {
  it('declares production when the arrow goes from my app box to an address', () => {
    expect(
      connectionAction(addresses, self, 'app:default/my-app', { nodeId: 'addr:orders' }),
    ).toEqual({
      type: 'UPDATE_ADDRESS',
      payload: { index: 0, direction: 'produces' },
    });
  });

  it('accepts my namespace box as the source when my app has no box', () => {
    expect(connectionAction(addresses, self, 'ns:default', { nodeId: 'addr:events' })).toEqual({
      type: 'UPDATE_ADDRESS',
      payload: { index: 1, direction: 'both' },
    });
  });

  it('declares consumption when the arrow goes from an address to my app box', () => {
    expect(
      connectionAction(addresses, self, 'addr:remote', { nodeId: 'app:default/my-app' }),
    ).toEqual({
      type: 'UPDATE_ADDRESS',
      payload: { index: 2, direction: 'both' },
    });
  });

  it('keeps an existing role when the arrow repeats it', () => {
    expect(
      connectionAction(addresses, self, 'addr:events', { nodeId: 'app:default/my-app' }),
    ).toEqual({
      type: 'UPDATE_ADDRESS',
      payload: { index: 1, direction: 'consumes' },
    });
  });

  it('asks for a new address when my app box is dropped on the canvas', () => {
    expect(
      connectionAction(addresses, self, 'app:default/my-app', { graph: true, x: 1, y: 2 }),
    ).toEqual({
      type: 'ADD_ADDRESS',
    });
  });

  it('ignores arrows between two addresses or from a foreign party', () => {
    expect(connectionAction(addresses, self, 'addr:orders', { nodeId: 'addr:events' })).toBeNull();
    expect(connectionAction(addresses, self, 'app:n/o', { nodeId: 'addr:orders' })).toBeNull();
    expect(
      connectionAction(addresses, self, 'addr:orders', { graph: true, x: 0, y: 0 }),
    ).toBeNull();
    expect(
      connectionAction(addresses, self, 'app:default/my-app', { nodeId: 'addr:unknown' }),
    ).toBeNull();
  });
});

describe('connectionAction on gates', () => {
  const universe = { namespaces: ['default', 'team-b'], appsByNamespace: { 'team-b': ['reader'] } };
  const owned: Address[] = [
    { address: 'orders', kind: 'owned', direction: 'produces' },
    {
      address: 'gated',
      kind: 'owned',
      direction: 'produces',
      consumerGate: "app.metadata.namespace == 'team-b'",
    },
    {
      address: 'custom',
      kind: 'owned',
      direction: 'produces',
      consumerGate: "app.metadata.labels['t'] == 'x'",
    },
  ];

  it('lets a namespace consume when the arrow goes from an address to its pill', () => {
    expect(connectionAction(owned, self, 'addr:orders', { nodeId: 'ns:team-b' }, universe)).toEqual(
      {
        type: 'SET_ADDRESS_GATE',
        payload: { index: 0, role: 'consumer', principals: [{ namespace: 'team-b' }] },
      },
    );
  });

  it('lets an app of a namespace produce when the arrow goes from its certificate to an address', () => {
    expect(
      connectionAction(owned, self, 'cred:team-b/reader', { nodeId: 'addr:orders' }, universe),
    ).toEqual({
      type: 'SET_ADDRESS_GATE',
      payload: {
        index: 0,
        role: 'producer',
        principals: [{ namespace: 'team-b', appName: 'reader' }],
      },
    });
  });

  it('adds to the parties a gate already admits', () => {
    expect(
      connectionAction(owned, self, 'addr:gated', { nodeId: 'any-namespace' }, universe),
    ).toEqual({
      type: 'SET_ADDRESS_GATE',
      payload: {
        index: 1,
        role: 'consumer',
        principals: [{ namespace: 'team-b' }, { namespace: '*' }],
      },
    });
  });

  it('does nothing for a party the gate already admits', () => {
    expect(
      connectionAction(owned, self, 'addr:gated', { nodeId: 'ns:team-b' }, universe),
    ).toBeNull();
  });

  it('refuses to overwrite a custom gate', () => {
    expect(
      connectionAction(owned, self, 'addr:custom', { nodeId: 'ns:team-b' }, universe),
    ).toBeNull();
  });

  it('ignores gates on a referenced address', () => {
    expect(
      connectionAction(addresses, self, 'addr:remote', { nodeId: 'ns:team-b' }, universe),
    ).toBeNull();
  });
});
