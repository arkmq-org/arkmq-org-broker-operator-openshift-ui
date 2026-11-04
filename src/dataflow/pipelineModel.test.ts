import type { PipelineNodeModel } from '@patternfly/react-topology';
import type { DataflowGraph } from './graph';
import { PIPELINE_TYPES, TASK_HEIGHT, toPipelineModel } from './pipelineModel';

const labels = { anyNamespace: 'Any namespace', anyApp: 'any app' };

const graph: DataflowGraph = {
  nodes: [
    { id: 'ns:a', kind: 'namespace', namespace: 'a' },
    { id: 'ns:b', kind: 'namespace', namespace: 'b' },
    { id: 'app:a/x', kind: 'app', namespace: 'a', name: 'x', parent: 'ns:a' },
    {
      id: 'cred:a/x',
      kind: 'credential',
      namespace: 'a',
      name: 'x',
      secret: 'x-app-cert',
      parent: 'app:a/x',
    },
    {
      id: 'addr:Q',
      kind: 'address',
      address: 'Q',
      owner: { namespace: 'a', name: 'x' },
      parent: 'app:a/x',
      foreign: false,
      gated: true,
      pubSub: false,
      issues: [],
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'cred:a/x',
      target: 'addr:Q',
      role: 'produce',
      kind: 'declared',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e2',
      source: 'addr:Q',
      target: 'ns:b',
      role: 'consume',
      kind: 'allowed',
      apps: [],
      subscriptions: [],
      issues: [],
    },
  ],
};

describe('toPipelineModel', () => {
  const model = toPipelineModel(graph, labels);
  const nodes: PipelineNodeModel[] = model.nodes ?? [];
  const node = (id: string) => nodes.find((n) => n.id === id);

  it('turns boxes into task pills sized from their label and groups into task groups', () => {
    expect(node('addr:Q')).toMatchObject({
      type: PIPELINE_TYPES.task,
      label: 'Q',
      height: TASK_HEIGHT,
    });
    expect(node('cred:a/x')).toMatchObject({ type: PIPELINE_TYPES.task, label: 'x-app-cert' });
    expect(node('ns:a')).toMatchObject({
      type: PIPELINE_TYPES.group,
      group: true,
      children: ['app:a/x'],
    });
    expect(node('app:a/x')).toMatchObject({
      type: PIPELINE_TYPES.group,
      group: true,
      children: ['cred:a/x', 'addr:Q'],
    });
    expect(node('ns:b')).toMatchObject({ type: PIPELINE_TYPES.task, label: 'b' });
  });

  it('repeats the arrows as runAfterTasks so the pipeline sees an order', () => {
    expect(node('addr:Q')?.runAfterTasks).toEqual(['cred:a/x']);
    expect(node('ns:b')?.runAfterTasks).toEqual(['addr:Q']);
    expect(node('cred:a/x')?.runAfterTasks).toEqual([]);
  });

  it('derives the task edges from runAfterTasks and puts our edge data back on them', () => {
    const edges = model.edges ?? [];
    const byPair = (source: string, target: string) =>
      edges.find((e) => e.source === source && e.target === target);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.type === PIPELINE_TYPES.edge)).toBe(true);
    const declared = byPair('cred:a/x', 'addr:Q');
    const allowed = byPair('addr:Q', 'ns:b');
    expect(declared?.data).toBe(graph.edges[0]);
    expect(allowed?.data).toBe(graph.edges[1]);
    // a gate edge is dashed, a declared one is not
    expect(allowed?.edgeStyle).not.toBe(declared?.edgeStyle);
    expect(declared?.visible).not.toBe(false);
    expect(allowed?.visible).not.toBe(false);
  });

  it('draws an app producing to and consuming from an address as one two-headed arrow', () => {
    const consume = {
      id: 'e3',
      source: 'addr:Q',
      target: 'cred:a/x',
      role: 'consume' as const,
      kind: 'declared' as const,
      apps: [],
      subscriptions: [],
      issues: [],
    };
    const both = toPipelineModel({ ...graph, edges: [...graph.edges, consume] }, labels);
    const edges = both.edges ?? [];
    const produce = edges.find((e) => e.id === 'e1');
    const back = edges.find((e) => e.id === 'e3');
    expect(produce?.visible).not.toBe(false);
    expect((produce?.data as { reverse?: unknown }).reverse).toBe(consume);
    // the consume arrow stays in the model, for pages and tests, but is not drawn
    expect(back?.visible).toBe(false);
    expect(back?.source).toBe('addr:Q');
    expect(back?.target).toBe('cred:a/x');
    // and does not order the pipeline, which would be a cycle
    const cred = both.nodes?.find((n) => n.id === 'cred:a/x') as PipelineNodeModel;
    expect(cred.runAfterTasks).toEqual([]);
  });

  it('draws the consume arrow of a pair when the address is not in the box of the other end', () => {
    const consume = {
      id: 'e3',
      source: 'addr:Q',
      target: 'cred:a/x',
      role: 'consume' as const,
      kind: 'declared' as const,
      apps: [],
      subscriptions: [],
      issues: [],
    };
    const elsewhere = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'addr:Q' ? { ...n, parent: 'ns:a', foreign: true } : n,
      ),
      edges: [...graph.edges, consume],
    };
    const edges = toPipelineModel(elsewhere, labels).edges ?? [];
    expect(edges.find((e) => e.id === 'e3')?.visible).toBeUndefined();
    expect(edges.find((e) => e.id === 'e1')?.visible).toBe(false);
    expect((edges.find((e) => e.id === 'e3')?.data as { reverse?: unknown }).reverse).toBe(
      graph.edges[0],
    );
  });
});
