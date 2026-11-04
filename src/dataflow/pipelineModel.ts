import {
  DEFAULT_SPACER_NODE_TYPE,
  EdgeAnimationSpeed,
  EdgeStyle,
  getEdgesFromNodes,
  getSpacerNodes,
  type EdgeModel,
  type Model,
  type PipelineNodeModel,
} from '@patternfly/react-topology';
import type { DataflowEdge, DataflowGraph, DataflowNode } from './graph';

/** Translated texts the model needs for labels it cannot derive from the CRs. */
export interface DataflowLabels {
  anyNamespace: string;
  anyApp: string;
}

/**
 * What a pipeline edge carries: our edge, plus the arrow going the other way between
 * the same two boxes when there is one (an app producing to and consuming from an
 * address). The pipeline draws both on the same line, so the pair is one edge with
 * an arrowhead at each end and the reverse one is not drawn, only kept in the model.
 */
export type PipelineEdgeData = DataflowEdge & {
  reverse?: DataflowEdge;
  /** Set by the library's task node: how far the drawn line starts before the node's edge. */
  indent?: number;
};

/** Node and edge types of the pipeline rendering, so the component factory can tell them apart. */
export const PIPELINE_TYPES = {
  task: 'dataflow-pipeline-task',
  group: 'dataflow-pipeline-group',
  edge: 'dataflow-pipeline-edge',
} as const;

/** Pill and ring sizes of the pipeline groups example, used as they are. */
export const TASK_WIDTH = 210;
export const TASK_HEIGHT = 32;
const TASK_PADDING: [number, number] = [0, 15];
const GROUP_PADDING: [number, number] = [40, 25];

const labelOf = (node: DataflowNode, labels: DataflowLabels): string => {
  switch (node.kind) {
    case 'namespace':
      return node.namespace;
    case 'app':
      return node.name;
    case 'credential':
      return node.secret;
    case 'anyApp':
      return labels.anyApp;
    case 'anyNamespace':
      return labels.anyNamespace;
    case 'address':
      return node.address;
    case 'customGate':
      return node.expression;
  }
};

const isGroup = (node: DataflowNode, graph: DataflowGraph): boolean =>
  node.kind === 'app' ||
  (node.kind === 'namespace' && graph.nodes.some((n) => 'parent' in n && n.parent === node.id));

/**
 * The same graph as a pipeline, built the way the pipelines example builds one: every
 * box becomes a task pill, namespaces and apps become task groups, each arrow becomes
 * a `runAfterTasks` entry, and the library derives the spacer nodes and task edges
 * from those. Our edge data is then put back on the edges whose endpoints are ours,
 * so their kind (declared, allowed, broken, unused) survives the trip.
 */
export const toPipelineModel = (graph: DataflowGraph, labels: DataflowLabels): Model => {
  const parentOf = (id: string): string | undefined => {
    const node = graph.nodes.find((n) => n.id === id);
    return node && 'parent' in node ? node.parent : undefined;
  };
  const ours = new Map<string, DataflowEdge>(
    graph.edges.map((edge) => [`${edge.source}->${edge.target}`, edge]),
  );
  const reverseOf = (edge: DataflowEdge) => ours.get(`${edge.target}->${edge.source}`);
  // Of two arrows between the same boxes only one is drawn, with a head at each end,
  // and only that one orders the pipeline (the pair would be a cycle): produce when
  // the address sits in the same box as the other end (an app's own address, which
  // follows its certificate), consume otherwise (the address comes first).
  const isDrawn = (edge: DataflowEdge): boolean => {
    if (!reverseOf(edge)) return true;
    const [address, other] =
      edge.role === 'produce' ? [edge.target, edge.source] : [edge.source, edge.target];
    const sameBox = parentOf(address) !== undefined && parentOf(address) === parentOf(other);
    return (edge.role === 'produce') === sameBox;
  };
  const drawn = graph.edges.filter(isDrawn);
  const hidden = graph.edges.filter((edge) => !isDrawn(edge));
  const runAfter = new Map<string, string[]>();
  for (const edge of drawn) {
    runAfter.set(edge.target, [...(runAfter.get(edge.target) ?? []), edge.source]);
  }
  const nodes: PipelineNodeModel[] = graph.nodes.map((node) => {
    const label = labelOf(node, labels);
    if (isGroup(node, graph)) {
      return {
        id: node.id,
        type: PIPELINE_TYPES.group,
        label,
        group: true,
        children: graph.nodes.filter((n) => 'parent' in n && n.parent === node.id).map((n) => n.id),
        style: { padding: GROUP_PADDING },
        runAfterTasks: [],
        data: node,
      };
    }
    return {
      id: node.id,
      type: PIPELINE_TYPES.task,
      label,
      width: TASK_WIDTH,
      height: TASK_HEIGHT,
      style: { padding: TASK_PADDING },
      runAfterTasks: runAfter.get(node.id) ?? [],
      data: node,
    };
  });
  const spacers = getSpacerNodes(nodes, DEFAULT_SPACER_NODE_TYPE);
  const allNodes = [...nodes, ...spacers];
  const edges: EdgeModel[] = getEdgesFromNodes(
    allNodes,
    DEFAULT_SPACER_NODE_TYPE,
    PIPELINE_TYPES.edge,
    PIPELINE_TYPES.edge,
  ).map((edge) => {
    const own = ours.get(`${edge.source ?? ''}->${edge.target ?? ''}`);
    const reverse = own && reverseOf(own);
    const gate = own?.kind === 'allowed' || own?.kind === 'unused';
    const data: PipelineEdgeData | undefined = own && reverse ? { ...own, reverse } : own;
    return {
      ...edge,
      // keep our ids on the edges that are ours, so pages and tests can find them
      id: own?.id ?? edge.id,
      edgeStyle: gate ? EdgeStyle.dashedMd : EdgeStyle.default,
      animationSpeed: gate ? EdgeAnimationSpeed.medium : EdgeAnimationSpeed.none,
      data,
    };
  });
  // the arrows not drawn stay in the model, unseen, so pages and tests still find them
  const unseen: EdgeModel[] = hidden.map((edge) => ({
    id: edge.id,
    type: PIPELINE_TYPES.edge,
    source: edge.source,
    target: edge.target,
    visible: false,
    data: edge,
  }));
  return {
    graph: { id: 'dataflow', type: 'graph' },
    nodes: allNodes,
    edges: [...edges, ...unseen],
  };
};
