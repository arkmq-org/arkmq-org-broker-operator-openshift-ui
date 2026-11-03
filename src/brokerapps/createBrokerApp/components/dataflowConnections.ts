import type {
  Address,
  AddressDirection,
  BrokerAppFormAction,
} from '../../../reducers/brokerapp/reducer';
import { addressNodeId, appNodeId, namespaceNodeId, type AppRef } from '../../../dataflow/graph';
import type { ConnectorTarget } from '../../../dataflow/topologyComponents';

const withRole = (direction: AddressDirection, role: 'produces' | 'consumes'): AddressDirection => {
  if (direction === 'both' || direction === role) return direction;
  if (direction === 'none') return role;
  return 'both';
};

/**
 * Turns a connector the user dragged on the diagram into a form action. An arrow
 * from this app's box into an address declares that the app produces to it; an
 * arrow from an address into this app's box declares that it consumes from it; an
 * arrow from this app's box onto empty canvas asks for a new address. Anything else
 * (two addresses, a foreign party) means nothing and yields no action.
 *
 * @param addresses - The form's address list
 * @param self - The app being edited
 * @param sourceId - Topology id of the node the connector was dragged from
 * @param target - Where it was dropped
 */
export const connectionAction = (
  addresses: Address[],
  self: AppRef,
  sourceId: string,
  target: ConnectorTarget,
): BrokerAppFormAction | null => {
  const mine = new Set([appNodeId(self), namespaceNodeId(self.namespace)]);
  const addressPrefix = addressNodeId('');
  const indexOf = (nodeId: string): number => {
    if (!nodeId.startsWith(addressPrefix)) return -1;
    const name = nodeId.slice(addressPrefix.length);
    return addresses.findIndex((entry) => entry.address.trim() === name);
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
  return null;
};
