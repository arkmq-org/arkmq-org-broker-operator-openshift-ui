import { EdgeAnimationSpeed, EdgeStyle, NodeShape, NodeStatus } from '@patternfly/react-topology';
import type { DataflowGraph } from './graph';
import {
  DATAFLOW_LAYOUT,
  EDGE_TYPE,
  NODE_SIZE,
  NODE_TYPES,
  toTopologyModel,
} from './topologyModel';

const graph: DataflowGraph = {
  nodes: [
    { id: 'ns:acme-enroll', kind: 'namespace', namespace: 'acme-enroll' },
    { id: 'ns:acme-ident', kind: 'namespace', namespace: 'acme-ident' },
    {
      id: 'app:acme-enroll/scorer',
      kind: 'app',
      namespace: 'acme-enroll',
      name: 'scorer',
      parent: 'ns:acme-enroll',
    },
    { id: 'any-namespace', kind: 'anyNamespace' },
    {
      id: 'addr:ENROLL.IN',
      kind: 'address',
      address: 'ENROLL.IN',
      owner: { namespace: 'acme-enroll', name: 'capture' },
      parent: 'ns:acme-enroll',
      foreign: false,
      gated: true,
      pubSub: false,
      issues: [],
    },
    {
      id: 'addr:LOST',
      kind: 'address',
      address: 'LOST',
      owner: { namespace: 'x', name: 'y' },
      foreign: true,
      gated: false,
      pubSub: true,
      issues: [{ kind: 'ownerMissing', owner: { namespace: 'x', name: 'y' }, address: 'LOST' }],
    },
    {
      id: 'gate:producer:ENROLL.IN',
      kind: 'customGate',
      expression: "app.metadata.labels['a'] == 'b'",
      role: 'producer',
      address: 'ENROLL.IN',
    },
  ],
  edges: [
    {
      id: 'e1',
      source: 'ns:acme-enroll',
      target: 'addr:ENROLL.IN',
      role: 'produce',
      kind: 'declared',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e2',
      source: 'addr:ENROLL.IN',
      target: 'app:acme-enroll/scorer',
      role: 'consume',
      kind: 'allowed',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e3',
      source: 'addr:ENROLL.IN',
      target: 'ns:acme-ident',
      role: 'consume',
      kind: 'unused',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e4',
      source: 'addr:LOST',
      target: 'ns:acme-ident',
      role: 'consume',
      kind: 'broken',
      apps: [],
      subscriptions: [],
      issues: [],
    },
  ],
};

describe('toTopologyModel', () => {
  const model = toTopologyModel(graph, { anyNamespace: 'Any namespace', anyApp: 'any app' });
  const node = (id: string) => model.nodes?.find((n) => n.id === id);
  const edge = (id: string) => model.edges?.find((e) => e.id === id);

  it('names the layout the diagram registers', () => {
    expect(model.graph).toMatchObject({ type: 'graph', layout: DATAFLOW_LAYOUT });
  });

  it('turns a namespace with app or address boxes into a group holding them', () => {
    expect(node('ns:acme-enroll')).toMatchObject({
      type: NODE_TYPES.namespace,
      group: true,
      children: ['app:acme-enroll/scorer', 'addr:ENROLL.IN'],
      label: 'acme-enroll',
    });
  });

  it('labels the any-app box with the translated text', () => {
    const withAny = toTopologyModel(
      {
        nodes: [
          { id: 'ns:x', kind: 'namespace', namespace: 'x' },
          { id: 'app:x/*', kind: 'app', namespace: 'x', name: '*', parent: 'ns:x' },
        ],
        edges: [],
      },
      { anyNamespace: 'Any namespace', anyApp: 'any app' },
    );
    expect(withAny.nodes?.find((n) => n.id === 'app:x/*')?.label).toBe('any app');
  });

  it('draws a namespace without boxes as a plain hexagon', () => {
    expect(node('ns:acme-ident')).toMatchObject({
      type: NODE_TYPES.namespace,
      shape: NodeShape.hexagon,
      label: 'acme-ident',
    });
    expect(node('ns:acme-ident')?.group).toBeUndefined();
  });

  it('gives every box the same square and a shape that says what it is', () => {
    expect(node('addr:LOST')).toMatchObject({
      shape: NodeShape.rect,
      width: NODE_SIZE,
      height: NODE_SIZE,
    });
    expect(node('app:acme-enroll/scorer')).toMatchObject({
      shape: NodeShape.ellipse,
      width: NODE_SIZE,
    });
    expect(node('gate:producer:ENROLL.IN')).toMatchObject({
      shape: NodeShape.rhombus,
      width: NODE_SIZE,
    });
  });

  it('labels the any-namespace box with the translated text', () => {
    expect(node('any-namespace')).toMatchObject({
      type: NODE_TYPES.anyNamespace,
      label: 'Any namespace',
    });
  });

  it('flags an address with issues as a warning', () => {
    expect(node('addr:LOST')?.status).toBe(NodeStatus.warning);
    expect(node('addr:ENROLL.IN')?.status).toBeUndefined();
  });

  it('shows the custom gate text as its label', () => {
    expect(node('gate:producer:ENROLL.IN')).toMatchObject({
      type: NODE_TYPES.customGate,
      label: "app.metadata.labels['a'] == 'b'",
      status: NodeStatus.info,
    });
  });

  it('dashes and animates gate edges and keeps declared and broken ones solid and still', () => {
    expect(edge('e1')?.edgeStyle).toBe(EdgeStyle.default);
    expect(edge('e1')?.animationSpeed).toBe(EdgeAnimationSpeed.none);
    expect(edge('e2')?.edgeStyle).toBe(EdgeStyle.dashedMd);
    expect(edge('e2')?.animationSpeed).toBe(EdgeAnimationSpeed.medium);
    expect(edge('e3')?.edgeStyle).toBe(EdgeStyle.dashedMd);
    expect(edge('e4')?.edgeStyle).toBe(EdgeStyle.default);
    expect(edge('e4')).toMatchObject({
      type: EDGE_TYPE,
      source: 'addr:LOST',
      target: 'ns:acme-ident',
    });
  });

  it('keeps the dataflow node and edge on the model data for the renderer', () => {
    expect(node('addr:LOST')?.data).toBe(graph.nodes[5]);
    expect(edge('e4')?.data).toBe(graph.edges[3]);
  });
});
