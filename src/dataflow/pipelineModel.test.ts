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
      parent: 'ns:a',
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
  const node = (id: string) => model.nodes?.find((n) => n.id === id);

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
      children: ['app:a/x', 'cred:a/x'],
    });
    expect(node('app:a/x')).toMatchObject({
      type: PIPELINE_TYPES.group,
      group: true,
      children: ['addr:Q'],
    });
    expect(node('ns:b')).toMatchObject({ type: PIPELINE_TYPES.task, label: 'b' });
  });

  it('repeats the arrows as runAfterTasks so the pipeline sees an order', () => {
    expect(node('addr:Q')?.runAfterTasks).toEqual(['cred:a/x']);
    expect(node('ns:b')?.runAfterTasks).toEqual(['addr:Q']);
    expect(node('cred:a/x')?.runAfterTasks).toEqual([]);
  });

  it('keeps the dataflow edges, dashed when they are gates', () => {
    expect(model.edges?.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(model.edges?.[1]).toMatchObject({
      type: PIPELINE_TYPES.edge,
      source: 'addr:Q',
      target: 'ns:b',
    });
    expect(model.edges?.[1].edgeStyle).not.toBe(model.edges?.[0].edgeStyle);
  });
});
