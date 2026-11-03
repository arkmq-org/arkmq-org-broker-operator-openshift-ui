import {
  EdgeStyle,
  NodeShape,
  NodeStatus,
  type EdgeModel,
  type Model,
  type NodeModel,
} from '@patternfly/react-topology';
import type { DataflowEdge, DataflowGraph, DataflowNode } from './graph';

/** Layout name the diagram registers its dagre factory under. */
export const DATAFLOW_LAYOUT = 'dataflow';
export const DATAFLOW_GRAPH_ID = 'dataflow';

/** Topology node types, one per dataflow node kind, so the component factory can pick a renderer. */
export const NODE_TYPES = {
  namespace: 'dataflow-namespace',
  app: 'dataflow-app',
  anyNamespace: 'dataflow-any-namespace',
  address: 'dataflow-address',
  customGate: 'dataflow-custom-gate',
} as const;
export const EDGE_TYPE = 'dataflow-edge';

/** Translated texts the model needs for labels it cannot derive from the CRs. */
export interface TopologyLabels {
  anyNamespace: string;
}

const CHAR_WIDTH = 7.5;
const LABEL_PADDING = 36;
const MAX_LABEL_CHARS = 40;

// Topology measures text in the DOM, which Jest lacks; a character estimate keeps the
// model pure and the layout stable between runs.
const widthFor = (label: string, min: number): number =>
  Math.max(min, Math.round(Math.min(label.length, MAX_LABEL_CHARS) * CHAR_WIDTH + LABEL_PADDING));

const toNodeModel = (
  node: DataflowNode,
  graph: DataflowGraph,
  labels: TopologyLabels,
): NodeModel => {
  switch (node.kind) {
    case 'namespace': {
      const children = graph.nodes
        .filter((n) => n.kind === 'app' && n.parent === node.id)
        .map((n) => n.id);
      if (children.length) {
        return {
          id: node.id,
          type: NODE_TYPES.namespace,
          label: node.namespace,
          group: true,
          children,
          data: node,
          style: { padding: 24 },
        };
      }
      return {
        id: node.id,
        type: NODE_TYPES.namespace,
        label: node.namespace,
        shape: NodeShape.rect,
        width: widthFor(node.namespace, 120),
        height: 44,
        data: node,
      };
    }
    case 'app':
      return {
        id: node.id,
        type: NODE_TYPES.app,
        label: node.name,
        shape: NodeShape.rect,
        width: widthFor(node.name, 100),
        height: 36,
        data: node,
      };
    case 'anyNamespace':
      return {
        id: node.id,
        type: NODE_TYPES.anyNamespace,
        label: labels.anyNamespace,
        shape: NodeShape.rect,
        width: widthFor(labels.anyNamespace, 140),
        height: 44,
        data: node,
      };
    case 'address':
      return {
        id: node.id,
        type: NODE_TYPES.address,
        label: node.address,
        shape: NodeShape.rect,
        width: widthFor(node.address, 150),
        height: 52,
        status: node.issues.length ? NodeStatus.warning : undefined,
        data: node,
      };
    case 'customGate':
      return {
        id: node.id,
        type: NODE_TYPES.customGate,
        label: node.expression,
        shape: NodeShape.rect,
        width: widthFor(node.expression, 160),
        height: 44,
        status: NodeStatus.info,
        data: node,
      };
  }
};

const toEdgeModel = (edge: DataflowEdge): EdgeModel => ({
  id: edge.id,
  type: EDGE_TYPE,
  source: edge.source,
  target: edge.target,
  edgeStyle:
    edge.kind === 'allowed' || edge.kind === 'unused' ? EdgeStyle.dashed : EdgeStyle.default,
  data: edge,
});

/**
 * Converts the dataflow graph into the model react-topology lays out and draws.
 * Namespaces that hold app boxes become groups; everything else is a rectangle sized
 * from its label. Gate edges are dashed, declared ones solid.
 */
export const toTopologyModel = (graph: DataflowGraph, labels: TopologyLabels): Model => ({
  graph: { id: DATAFLOW_GRAPH_ID, type: 'graph', layout: DATAFLOW_LAYOUT },
  nodes: graph.nodes.map((node) => toNodeModel(node, graph, labels)),
  edges: graph.edges.map(toEdgeModel),
});
