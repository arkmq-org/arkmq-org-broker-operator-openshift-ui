import {
  EdgeAnimationSpeed,
  EdgeStyle,
  NodeShape,
  NodeStatus,
  type EdgeModel,
  type Model,
  type NodeModel,
} from '@patternfly/react-topology';
import type { DataflowEdge, DataflowGraph, DataflowNode } from './graph';
import { ANY_NAMESPACE } from './gates';

export const DATAFLOW_GRAPH_ID = 'dataflow';

/** Topology node types, one per dataflow node kind, so the component factory can pick a renderer. */
export const NODE_TYPES = {
  namespace: 'dataflow-namespace',
  /** A namespace drawn as a group around the app boxes it holds. */
  namespaceGroup: 'dataflow-namespace-group',
  /** An app drawn as a group around its credential and the addresses it owns. */
  app: 'dataflow-app',
  credential: 'dataflow-credential',
  anyApp: 'dataflow-any-app',
  anyNamespace: 'dataflow-any-namespace',
  address: 'dataflow-address',
  customGate: 'dataflow-custom-gate',
} as const;
export const EDGE_TYPE = 'dataflow-edge';

/** Translated texts the model needs for labels it cannot derive from the CRs. */
export interface TopologyLabels {
  anyNamespace: string;
  anyApp: string;
  /** Shown as a credential's secret name before the operator has bound the app. */
  unbound: string;
}

/** Side of the square every box is drawn on; labels hang below, so names never size a box. */
export const NODE_SIZE = 64;

const childrenOf = (graph: DataflowGraph, id: string): string[] =>
  graph.nodes.filter((n) => 'parent' in n && n.parent === id).map((n) => n.id);

const toNodeModel = (
  node: DataflowNode,
  graph: DataflowGraph,
  labels: TopologyLabels,
): NodeModel => {
  switch (node.kind) {
    case 'namespace': {
      const children = childrenOf(graph, node.id);
      const label = node.namespace === ANY_NAMESPACE ? labels.anyNamespace : node.namespace;
      if (children.length) {
        return {
          id: node.id,
          type: NODE_TYPES.namespaceGroup,
          label,
          group: true,
          children,
          data: node,
          style: { padding: 40 },
        };
      }
      return {
        id: node.id,
        type: NODE_TYPES.namespace,
        label,
        shape: NodeShape.hexagon,
        width: NODE_SIZE,
        height: NODE_SIZE,
        data: node,
      };
    }
    case 'app':
      return {
        id: node.id,
        type: NODE_TYPES.app,
        label: node.name,
        group: true,
        children: childrenOf(graph, node.id),
        data: node,
        style: { padding: 30 },
      };
    case 'credential':
      return {
        id: node.id,
        type: NODE_TYPES.credential,
        label: node.secret ?? labels.unbound,
        shape: NodeShape.ellipse,
        width: NODE_SIZE,
        height: NODE_SIZE,
        data: node,
      };
    case 'anyApp':
      return {
        id: node.id,
        type: NODE_TYPES.anyApp,
        label: labels.anyApp,
        shape: NodeShape.ellipse,
        width: NODE_SIZE,
        height: NODE_SIZE,
        data: node,
      };
    case 'anyNamespace':
      return {
        id: node.id,
        type: NODE_TYPES.anyNamespace,
        label: labels.anyNamespace,
        shape: NodeShape.hexagon,
        width: NODE_SIZE,
        height: NODE_SIZE,
        data: node,
      };
    case 'address':
      return {
        id: node.id,
        type: NODE_TYPES.address,
        label: node.address,
        shape: NodeShape.rect,
        width: NODE_SIZE,
        height: NODE_SIZE,
        status: node.issues.length ? NodeStatus.warning : undefined,
        data: node,
      };
    case 'customGate':
      return {
        id: node.id,
        type: NODE_TYPES.customGate,
        label: node.expression,
        shape: NodeShape.rhombus,
        width: NODE_SIZE,
        height: NODE_SIZE,
        status: NodeStatus.info,
        data: node,
      };
  }
};

const toEdgeModel = (edge: DataflowEdge): EdgeModel => {
  const gate = edge.kind === 'allowed' || edge.kind === 'unused';
  return {
    id: edge.id,
    type: EDGE_TYPE,
    source: edge.source,
    target: edge.target,
    edgeStyle: gate ? EdgeStyle.dashedMd : EdgeStyle.default,
    // a gate is a possibility, not traffic: the moving dashes say so
    animationSpeed: gate ? EdgeAnimationSpeed.medium : EdgeAnimationSpeed.none,
    data: edge,
  };
};

/**
 * Converts the dataflow graph into the model react-topology lays out and draws.
 * Namespaces and apps are groups, nested; every other node is a square whose shape
 * says what it is: a rectangle for an address, a circle for a credential, a hexagon
 * for a namespace, a rhombus for a gate. Gate edges are dashed and animated,
 * declared ones solid.
 */
export const toTopologyModel = (graph: DataflowGraph, labels: TopologyLabels): Model => ({
  graph: { id: DATAFLOW_GRAPH_ID, type: 'graph' },
  nodes: graph.nodes.map((node) => toNodeModel(node, graph, labels)),
  edges: graph.edges.map(toEdgeModel),
});
