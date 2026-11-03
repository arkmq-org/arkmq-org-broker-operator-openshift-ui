import { EdgeAnimationSpeed, EdgeStyle, NodeShape, NodeStatus } from '@patternfly/react-topology';
import type { DataflowGraph } from './graph';
import { EDGE_TYPE, NODE_SIZE, NODE_TYPES, toTopologyModel } from './topologyModel';

const labels = { anyNamespace: 'Any namespace', anyApp: 'any app', unbound: 'not bound yet' };

const graph: DataflowGraph = {
  nodes: [
    { id: 'ns:acme-enroll', kind: 'namespace', namespace: 'acme-enroll' },
    { id: 'ns:acme-ident', kind: 'namespace', namespace: 'acme-ident' },
    { id: 'ns:lonely', kind: 'namespace', namespace: 'lonely' },
    {
      id: 'app:acme-enroll/scorer',
      kind: 'app',
      namespace: 'acme-enroll',
      name: 'scorer',
      parent: 'ns:acme-enroll',
    },
    {
      id: 'app:acme-ident/matcher',
      kind: 'app',
      namespace: 'acme-ident',
      name: 'matcher',
      parent: 'ns:acme-ident',
    },
    {
      id: 'cred:acme-enroll/scorer',
      kind: 'credential',
      namespace: 'acme-enroll',
      name: 'scorer',
      secret: 'scorer-binding-secret',
      parent: 'app:acme-enroll/scorer',
    },
    {
      id: 'cred:acme-ident/matcher',
      kind: 'credential',
      namespace: 'acme-ident',
      name: 'matcher',
      parent: 'app:acme-ident/matcher',
    },
    { id: 'any-app:acme-ident', kind: 'anyApp', namespace: 'acme-ident', parent: 'ns:acme-ident' },
    { id: 'any-namespace', kind: 'anyNamespace' },
    {
      id: 'addr:ENROLL.IN',
      kind: 'address',
      address: 'ENROLL.IN',
      owner: { namespace: 'acme-enroll', name: 'scorer' },
      parent: 'app:acme-enroll/scorer',
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
      source: 'cred:acme-enroll/scorer',
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
      target: 'cred:acme-ident/matcher',
      role: 'consume',
      kind: 'allowed',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e3',
      source: 'addr:ENROLL.IN',
      target: 'any-app:acme-ident',
      role: 'consume',
      kind: 'unused',
      apps: [],
      subscriptions: [],
      issues: [],
    },
    {
      id: 'e4',
      source: 'addr:LOST',
      target: 'cred:acme-ident/matcher',
      role: 'consume',
      kind: 'broken',
      apps: [],
      subscriptions: [],
      issues: [],
    },
  ],
};

describe('toTopologyModel', () => {
  const model = toTopologyModel(graph, labels);
  const node = (id: string) => model.nodes?.find((n) => n.id === id);
  const edge = (id: string) => model.edges?.find((e) => e.id === id);

  it('leaves the layout to the diagram, which lets the viewer pick one', () => {
    expect(model.graph).toMatchObject({ type: 'graph' });
    expect(model.graph?.layout).toBeUndefined();
  });

  it('nests groups: a namespace holds app boxes, an app box holds its credential and addresses', () => {
    expect(node('ns:acme-enroll')).toMatchObject({
      type: NODE_TYPES.namespaceGroup,
      group: true,
      children: ['app:acme-enroll/scorer'],
      label: 'acme-enroll',
    });
    expect(node('app:acme-enroll/scorer')).toMatchObject({
      type: NODE_TYPES.app,
      group: true,
      children: ['cred:acme-enroll/scorer', 'addr:ENROLL.IN'],
      label: 'scorer',
    });
    expect(node('ns:acme-ident')?.children).toEqual([
      'app:acme-ident/matcher',
      'any-app:acme-ident',
    ]);
  });

  it('draws a namespace without boxes as a plain hexagon', () => {
    expect(node('ns:lonely')).toMatchObject({
      type: NODE_TYPES.namespace,
      shape: NodeShape.hexagon,
      label: 'lonely',
    });
    expect(node('ns:lonely')?.group).toBeUndefined();
  });

  it('labels a credential with its secret name, or says the app is not bound yet', () => {
    expect(node('cred:acme-enroll/scorer')).toMatchObject({
      type: NODE_TYPES.credential,
      shape: NodeShape.ellipse,
      label: 'scorer-binding-secret',
    });
    expect(node('cred:acme-ident/matcher')?.label).toBe('not bound yet');
  });

  it('gives every box the same square and a shape that says what it is', () => {
    expect(node('addr:LOST')).toMatchObject({
      shape: NodeShape.rect,
      width: NODE_SIZE,
      height: NODE_SIZE,
    });
    expect(node('cred:acme-enroll/scorer')).toMatchObject({
      shape: NodeShape.ellipse,
      width: NODE_SIZE,
    });
    expect(node('any-app:acme-ident')).toMatchObject({
      shape: NodeShape.ellipse,
      label: 'any app',
    });
    expect(node('any-namespace')).toMatchObject({
      shape: NodeShape.hexagon,
      label: 'Any namespace',
    });
    expect(node('gate:producer:ENROLL.IN')).toMatchObject({
      shape: NodeShape.rhombus,
      width: NODE_SIZE,
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
    expect(edge('e4')).toMatchObject({ type: EDGE_TYPE, source: 'addr:LOST' });
  });

  it('keeps the dataflow node and edge on the model data for the renderer', () => {
    expect(node('addr:LOST')?.data).toBe(graph.nodes.find((n) => n.id === 'addr:LOST'));
    expect(edge('e4')?.data).toBe(graph.edges[3]);
  });
});
