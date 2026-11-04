import type {
  Address,
  AddressDirection,
  BrokerAppFormAction,
} from '../../../reducers/brokerapp/reducer';
import {
  ANY_NAMESPACE_NODE_ID,
  addressNodeId,
  anyAppNodeId,
  appNodeId,
  credentialNodeId,
  namespaceNodeId,
  type AppRef,
} from '../../../dataflow/graph';
import {
  ANY_NAMESPACE,
  interpretGate,
  type GatePrincipal,
  type GateUniverse,
} from '../../../dataflow/gates';
import type { ConnectorTarget } from '../../../dataflow/pipelineComponents';

const withRole = (direction: AddressDirection, role: 'produces' | 'consumes'): AddressDirection => {
  if (direction === 'both' || direction === role) return direction;
  if (direction === 'none') return role;
  return 'both';
};

/** The party a node stands for, when it is one: a namespace, an app of a namespace, or everyone. */
const principalOf = (nodeId: string, self: AppRef): GatePrincipal | null => {
  if (nodeId === ANY_NAMESPACE_NODE_ID) return { namespace: ANY_NAMESPACE };
  const ns = namespaceNodeId('');
  if (nodeId.startsWith(ns)) return { namespace: nodeId.slice(ns.length) };
  const anyApp = anyAppNodeId('');
  if (nodeId.startsWith(anyApp)) return { namespace: nodeId.slice(anyApp.length) };
  const cred = 'cred:';
  if (nodeId.startsWith(cred)) {
    const [namespace, name] = nodeId.slice(cred.length).split('/');
    if (!namespace || !name) return null;
    if (namespace === self.namespace && name === self.name) return null;
    return { namespace, appName: name };
  }
  return null;
};

const samePrincipal = (a: GatePrincipal, b: GatePrincipal): boolean =>
  a.namespace === b.namespace && (a.appName ?? '') === (b.appName ?? '');

/**
 * Turns a connector the user dragged on the diagram into a form action.
 * - from this app's certificate (or its box) into an address: the app produces to it;
 * - from an address into this app's certificate: the app consumes from it;
 * - from this app's certificate onto empty canvas: a new address;
 * - from another party (a namespace, an app of a namespace, everyone) into an owned
 *   address: that party may produce to it; from the address into the party: it may
 *   consume. The gate must be one the form can read; a custom expression yields
 *   nothing rather than being overwritten.
 * Anything else (two addresses, two parties) means nothing and yields no action.
 *
 * @param addresses - The form's address list
 * @param self - The app being edited
 * @param sourceId - Topology id of the node the connector was dragged from
 * @param target - Where it was dropped
 * @param universe - Namespaces and apps, to read the gate being extended
 */
export const connectionAction = (
  addresses: Address[],
  self: AppRef,
  sourceId: string,
  target: ConnectorTarget,
  universe: GateUniverse = { namespaces: [], appsByNamespace: {} },
): BrokerAppFormAction | null => {
  const mine = new Set([credentialNodeId(self), appNodeId(self), namespaceNodeId(self.namespace)]);
  const addressPrefix = addressNodeId('');
  const indexOf = (nodeId: string): number => {
    if (!nodeId.startsWith(addressPrefix)) return -1;
    const name = nodeId.slice(addressPrefix.length);
    return addresses.findIndex((entry) => entry.address.trim() === name);
  };
  const openGate = (
    index: number,
    role: 'producer' | 'consumer',
    principal: GatePrincipal,
  ): BrokerAppFormAction | null => {
    const entry = addresses[index];
    if (entry.kind !== 'owned') return null;
    const view = interpretGate(
      role === 'producer' ? entry.producerGate : entry.consumerGate,
      universe,
    );
    if (view.kind === 'custom') return null;
    const current = view.kind === 'principals' ? view.principals : [];
    if (current.some((p) => samePrincipal(p, principal))) return null;
    return {
      type: 'SET_ADDRESS_GATE',
      payload: { index, role, principals: [...current, principal] },
    };
  };

  if ('graph' in target) {
    return mine.has(sourceId) ? { type: 'ADD_ADDRESS' } : null;
  }
  if (mine.has(sourceId)) {
    const index = indexOf(target.nodeId);
    if (index < 0) return null;
    return {
      type: 'UPDATE_ADDRESS',
      payload: { index, direction: withRole(addresses[index].direction, 'produces') },
    };
  }
  if (mine.has(target.nodeId)) {
    const index = indexOf(sourceId);
    if (index < 0) return null;
    return {
      type: 'UPDATE_ADDRESS',
      payload: { index, direction: withRole(addresses[index].direction, 'consumes') },
    };
  }
  const producer = principalOf(sourceId, self);
  if (producer) {
    const index = indexOf(target.nodeId);
    return index < 0 ? null : openGate(index, 'producer', producer);
  }
  const consumer = principalOf(target.nodeId, self);
  if (consumer) {
    const index = indexOf(sourceId);
    return index < 0 ? null : openGate(index, 'consumer', consumer);
  }
  return null;
};
