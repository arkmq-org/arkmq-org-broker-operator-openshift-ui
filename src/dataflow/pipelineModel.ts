import {
  EdgeAnimationSpeed,
  EdgeStyle,
  type EdgeModel,
  type Model,
  type PipelineNodeModel,
} from '@patternfly/react-topology';
import type { DataflowEdge, DataflowGraph, DataflowNode } from './graph';
import type { TopologyLabels } from './topologyModel';

/** Node and edge types of the pipeline rendering, so the component factory can tell them apart. */
export const PIPELINE_TYPES = {
  task: 'dataflow-pipeline-task',
  group: 'dataflow-pipeline-group',
  edge: 'dataflow-pipeline-edge',
  /** An invisible edge between two sibling boxes, so the pipeline layout orders them. */
  hiddenEdge: 'dataflow-pipeline-hidden-edge',
} as const;

export const TASK_HEIGHT = 32;
const CHAR_WIDTH = 7.5;
const TASK_PADDING = 76;

const taskWidth = (label: string): number =>
  Math.max(150, Math.round(Math.min(label.length, 40) * CHAR_WIDTH + TASK_PADDING));

const labelOf = (node: DataflowNode, labels: TopologyLabels): string => {
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
 * The pipeline layout lays each group out on its own and orders siblings only by the
 * edges between those siblings. Our arrows join a credential to an address in another
 * box, so without help the boxes would stack. For every arrow this yields the pair of
 * sibling boxes under the lowest common ancestor, to join with an invisible edge.
 */
const siblingPairs = (graph: DataflowGraph): [string, string][] => {
  const parentOf = new Map<string, string>();
  for (const node of graph.nodes) {
    if ('parent' in node && node.parent) parentOf.set(node.id, node.parent);
  }
  const chain = (id: string): string[] => {
    const out = [id];
    let current = parentOf.get(id);
    while (current) {
      out.push(current);
      current = parentOf.get(current);
    }
    return out;
  };
  const pairs = new Map<string, [string, string]>();
  for (const edge of graph.edges) {
    const from = chain(edge.source);
    const to = chain(edge.target);
    let a = from[from.length - 1];
    let b = to[to.length - 1];
    // walk down from the roots while the ancestors coincide
    let i = from.length - 1;
    let j = to.length - 1;
    while (i > 0 && j > 0 && from[i] === to[j]) {
      i -= 1;
      j -= 1;
      a = from[i];
      b = to[j];
    }
    if (a === b || (a === edge.source && b === edge.target)) continue;
    pairs.set(`${a}->${b}`, [a, b]);
  }
  return Array.from(pairs.values());
};

/**
 * The same graph as a pipeline: every box becomes a task pill laid out left to right
 * by the pipeline layout, namespaces and apps become task groups, and each arrow a
 * task edge with the pipeline's right-angled routing. `runAfterTasks` repeats the
 * arrows so the pipeline element factory sees a pipeline; the edges are still ours,
 * so their kind (declared, allowed, broken, unused) survives.
 */
export const toPipelineModel = (graph: DataflowGraph, labels: TopologyLabels): Model => {
  const runAfter = new Map<string, string[]>();
  for (const edge of graph.edges) {
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
        style: { padding: [40, 25] },
        runAfterTasks: [],
        data: node,
      };
    }
    return {
      id: node.id,
      type: PIPELINE_TYPES.task,
      label,
      width: taskWidth(label),
      height: TASK_HEIGHT,
      style: { padding: [0, 15] },
      runAfterTasks: runAfter.get(node.id) ?? [],
      data: node,
    };
  });
  const edges: EdgeModel[] = graph.edges.map((edge: DataflowEdge) => {
    const gate = edge.kind === 'allowed' || edge.kind === 'unused';
    return {
      id: edge.id,
      type: PIPELINE_TYPES.edge,
      source: edge.source,
      target: edge.target,
      edgeStyle: gate ? EdgeStyle.dashedMd : EdgeStyle.default,
      animationSpeed: gate ? EdgeAnimationSpeed.medium : EdgeAnimationSpeed.none,
      data: edge,
    };
  });
  const hidden: EdgeModel[] = siblingPairs(graph).map(([source, target]) => ({
    id: `hidden:${source}->${target}`,
    type: PIPELINE_TYPES.hiddenEdge,
    source,
    target,
  }));
  return { graph: { id: 'dataflow', type: 'graph' }, nodes, edges: [...edges, ...hidden] };
};
