import type { BrokerAppCR } from '../k8s/types';
import { K8sResourceConditionStatus } from '../k8s/types';
import type { GateUniverse } from './gates';
import {
  ANY_NAMESPACE_NODE_ID,
  addressNodeId,
  appNodeId,
  buildDataflowGraph,
  gateNodeId,
  namespaceNodeId,
  type DataflowEdge,
  type DataflowNode,
} from './graph';

const universe: GateUniverse = {
  namespaces: ['acme-enroll', 'acme-ident', 'acme-notify'],
  appsByNamespace: {
    'acme-enroll': ['capture', 'scorer'],
    'acme-ident': ['matcher'],
    'acme-notify': ['notifier'],
  },
};

const app = (
  namespace: string,
  name: string,
  spec: Partial<BrokerAppCR['spec']>,
  deployedMessage?: string,
): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace },
  spec: { serviceSelector: {}, ...spec },
  ...(deployedMessage
    ? {
        status: {
          conditions: [
            {
              type: 'Deployed',
              status: K8sResourceConditionStatus.False,
              reason: 'ValidationFailed',
              message: deployedMessage,
            },
          ],
        },
      }
    : {}),
});

// The acme tutorial: capture -> ENROLL.IN -> scorer -> IDENT.REQUEST -> matcher
const capture = app('acme-enroll', 'capture', {
  addresses: [
    {
      address: 'ENROLL.IN',
      consumerOfAppSelector:
        "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
    },
  ],
  capabilities: [{ producerOf: [{ address: 'ENROLL.IN' }] }],
});
const scorer = app('acme-enroll', 'scorer', {
  addresses: [
    { address: 'IDENT.REQUEST', consumerOfAppSelector: "app.metadata.namespace == 'acme-ident'" },
  ],
  capabilities: [
    {
      consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }],
      producerOf: [{ address: 'IDENT.REQUEST' }],
    },
  ],
});
const matcher = app('acme-ident', 'matcher', {
  capabilities: [
    { consumerOf: [{ address: 'IDENT.REQUEST', appNamespace: 'acme-enroll', appName: 'scorer' }] },
  ],
});

const byId = <T extends { id: string }>(items: T[], id: string): T | undefined =>
  items.find((item) => item.id === id);
const edgesOfKind = (edges: DataflowEdge[], kind: DataflowEdge['kind']): DataflowEdge[] =>
  edges.filter((e) => e.kind === kind);
const kinds = (nodes: DataflowNode[]): string[] => nodes.map((n) => n.kind);

describe('buildDataflowGraph on a single app (form and app page)', () => {
  it('draws an owned address produced by its namespace', () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [capture], universe });
    expect(byId(nodes, addressNodeId('ENROLL.IN'))).toMatchObject({
      kind: 'address',
      owner: { namespace: 'acme-enroll', name: 'capture' },
      foreign: false,
      gated: true,
    });
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: namespaceNodeId('acme-enroll'),
        target: addressNodeId('ENROLL.IN'),
        role: 'produce',
        kind: 'declared',
        apps: [{ namespace: 'acme-enroll', name: 'capture' }],
      }),
    );
  });

  it('draws an app-level gate as an app box inside its namespace, dashed', () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [capture], universe });
    const scorerNode = byId(nodes, appNodeId({ namespace: 'acme-enroll', name: 'scorer' }));
    expect(scorerNode).toMatchObject({ kind: 'app', parent: namespaceNodeId('acme-enroll') });
    expect(edgesOfKind(edges, 'allowed')).toEqual([
      expect.objectContaining({
        source: addressNodeId('ENROLL.IN'),
        target: appNodeId({ namespace: 'acme-enroll', name: 'scorer' }),
        role: 'consume',
      }),
    ]);
  });

  it('attaches the declared flow of a gated app to its own box, not its namespace', () => {
    // scorer gates IDENT.REQUEST to acme-ident, and capture gates ENROLL.IN to scorer:
    // when both are drawn, scorer has a box and its flows start there.
    const { edges } = buildDataflowGraph({ apps: [capture, scorer], universe });
    const scorerId = appNodeId({ namespace: 'acme-enroll', name: 'scorer' });
    expect(edges).toContainEqual(
      expect.objectContaining({ source: scorerId, target: addressNodeId('IDENT.REQUEST') }),
    );
    expect(edges).not.toContainEqual(
      expect.objectContaining({
        source: namespaceNodeId('acme-enroll'),
        target: addressNodeId('IDENT.REQUEST'),
      }),
    );
  });

  it('draws a referenced address as foreign with its owner when the owner is supplied', () => {
    const { nodes, edges } = buildDataflowGraph({
      apps: [matcher],
      ownerApps: [scorer],
      universe,
    });
    expect(byId(nodes, addressNodeId('IDENT.REQUEST'))).toMatchObject({
      kind: 'address',
      owner: { namespace: 'acme-enroll', name: 'scorer' },
      foreign: true,
      gated: true,
      issues: [],
    });
    expect(edges).toEqual([
      expect.objectContaining({
        source: addressNodeId('IDENT.REQUEST'),
        target: namespaceNodeId('acme-ident'),
        role: 'consume',
        kind: 'declared',
        issues: [],
      }),
    ]);
  });

  it('flags a referenced address whose owner cannot be seen', () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [matcher], universe });
    expect(byId(nodes, addressNodeId('IDENT.REQUEST'))).toMatchObject({
      issues: [
        {
          kind: 'ownerMissing',
          owner: { namespace: 'acme-enroll', name: 'scorer' },
          address: 'IDENT.REQUEST',
        },
      ],
    });
    expect(edges[0].kind).toBe('declared');
    expect(edges[0].issues).toEqual([expect.objectContaining({ kind: 'ownerMissing' })]);
  });

  it('flags a referenced address the visible owner does not declare', () => {
    const { nodes } = buildDataflowGraph({
      apps: [matcher],
      ownerApps: [app('acme-enroll', 'scorer', {})],
      universe,
    });
    expect(byId(nodes, addressNodeId('IDENT.REQUEST'))).toMatchObject({
      issues: [expect.objectContaining({ kind: 'ownerNotDeclaring' })],
    });
  });

  it('draws a custom gate as a text node', () => {
    const owner = app('acme-enroll', 'capture', {
      addresses: [
        { address: 'ENROLL.IN', producerOfAppSelector: "app.metadata.labels['tier'] == 'prd'" },
      ],
    });
    const { nodes, edges } = buildDataflowGraph({ apps: [owner], universe });
    expect(byId(nodes, gateNodeId('ENROLL.IN', 'producer'))).toMatchObject({
      kind: 'customGate',
      expression: "app.metadata.labels['tier'] == 'prd'",
    });
    expect(edges).toEqual([
      expect.objectContaining({
        source: gateNodeId('ENROLL.IN', 'producer'),
        target: addressNodeId('ENROLL.IN'),
        kind: 'allowed',
      }),
    ]);
  });

  it('draws a gate open to everyone as the any-namespace box', () => {
    const owner = app('acme-enroll', 'capture', {
      addresses: [{ address: 'ENROLL.IN', consumerOfAppSelector: 'true' }],
    });
    const { nodes, edges } = buildDataflowGraph({ apps: [owner], universe });
    expect(kinds(nodes)).toContain('anyNamespace');
    expect(edges).toEqual([
      expect.objectContaining({
        source: addressNodeId('ENROLL.IN'),
        target: ANY_NAMESPACE_NODE_ID,
        kind: 'allowed',
      }),
    ]);
  });

  it('treats a capability without appName as an owned address', () => {
    const implicit = app('acme-enroll', 'loop', {
      capabilities: [{ producerOf: [{ address: 'LOOP' }], consumerOf: [{ address: 'LOOP' }] }],
    });
    const { nodes, edges } = buildDataflowGraph({ apps: [implicit], universe });
    expect(byId(nodes, addressNodeId('LOOP'))).toMatchObject({
      owner: { namespace: 'acme-enroll', name: 'loop' },
      foreign: false,
      gated: false,
    });
    expect(edges.map((e) => e.role).sort()).toEqual(['consume', 'produce']);
  });

  it('keeps consumer subscriptions on the consume edge', () => {
    const subscriber = app('acme-notify', 'notifier', {
      capabilities: [
        {
          consumerOf: [
            {
              address: 'IDENT.RESULTS',
              appNamespace: 'acme-ident',
              appName: 'matcher',
              subscriptions: ['registry'],
            },
          ],
        },
      ],
    });
    const { edges } = buildDataflowGraph({ apps: [subscriber], universe });
    expect(edges[0].subscriptions).toEqual(['registry']);
  });

  it('is deterministic whatever the input order', () => {
    const a = buildDataflowGraph({ apps: [capture, scorer, matcher], universe, complete: true });
    const b = buildDataflowGraph({ apps: [matcher, scorer, capture], universe, complete: true });
    expect(a).toEqual(b);
  });
});

describe('buildDataflowGraph on a complete service', () => {
  const service = { apps: [capture, scorer, matcher], universe, complete: true };

  it('draws the tutorial chain with every gate realised', () => {
    const { edges } = buildDataflowGraph(service);
    expect(edgesOfKind(edges, 'allowed')).toEqual([]);
    expect(edgesOfKind(edges, 'unused')).toEqual([]);
    expect(edgesOfKind(edges, 'broken')).toEqual([]);
    const scorerId = appNodeId({ namespace: 'acme-enroll', name: 'scorer' });
    expect(edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(
      [
        `${namespaceNodeId('acme-enroll')}>${addressNodeId('ENROLL.IN')}`,
        `${addressNodeId('ENROLL.IN')}>${scorerId}`,
        `${scorerId}>${addressNodeId('IDENT.REQUEST')}`,
        `${addressNodeId('IDENT.REQUEST')}>${namespaceNodeId('acme-ident')}`,
      ].sort(),
    );
  });

  it('marks a flow the owner refuses as broken', () => {
    const intruder = app(
      'acme-ident',
      'intruder',
      {
        capabilities: [
          {
            consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }],
          },
        ],
      },
      "referenced app acme-enroll/capture does not share address 'ENROLL.IN' for role 'consumer'",
    );
    const { edges } = buildDataflowGraph({ ...service, apps: [...service.apps, intruder] });
    const broken = edgesOfKind(edges, 'broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({
      source: addressNodeId('ENROLL.IN'),
      target: namespaceNodeId('acme-ident'),
      apps: [{ namespace: 'acme-ident', name: 'intruder' }],
    });
    expect(broken[0].issues.map((issue) => issue.kind)).toEqual(['refused', 'notDeployed']);
    const notDeployed = broken[0].issues[1];
    expect(notDeployed.kind === 'notDeployed' ? notDeployed.message : '').toContain(
      'does not share',
    );
  });

  it('marks an admitted party that declares nothing as an open door', () => {
    const { edges } = buildDataflowGraph({ ...service, apps: [capture, scorer] });
    const unused = edgesOfKind(edges, 'unused');
    expect(unused).toEqual([
      expect.objectContaining({
        source: addressNodeId('IDENT.REQUEST'),
        target: namespaceNodeId('acme-ident'),
        role: 'consume',
      }),
    ]);
  });

  it('merges several credentials of one namespace onto one arrow', () => {
    const second = app('acme-ident', 'auditor', {
      capabilities: [
        {
          consumerOf: [
            { address: 'IDENT.REQUEST', appNamespace: 'acme-enroll', appName: 'scorer' },
          ],
        },
      ],
    });
    const { edges } = buildDataflowGraph({ ...service, apps: [...service.apps, second] });
    const toIdent = edges.filter((e) => e.target === namespaceNodeId('acme-ident'));
    expect(toIdent).toHaveLength(1);
    expect(toIdent[0].apps).toEqual([
      { namespace: 'acme-ident', name: 'matcher' },
      { namespace: 'acme-ident', name: 'auditor' },
    ]);
  });

  it('reports a gate the browser cannot evaluate without breaking the edge', () => {
    const owner = app('acme-enroll', 'capture', {
      addresses: [
        { address: 'ENROLL.IN', consumerOfAppSelector: "app.metadata.labels['tier'] == 'prd'" },
      ],
    });
    const consumer = app('acme-ident', 'matcher', {
      capabilities: [
        { consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }] },
      ],
    });
    const { edges } = buildDataflowGraph({ apps: [owner, consumer], universe, complete: true });
    const declared = edgesOfKind(edges, 'declared');
    expect(declared).toHaveLength(1);
    expect(declared[0].issues).toEqual([expect.objectContaining({ kind: 'unknownGate' })]);
  });

  it('treats a declared flow from any other app as realising an everyone gate', () => {
    const owner = app('acme-enroll', 'capture', {
      addresses: [{ address: 'ENROLL.IN', consumerOfAppSelector: 'true' }],
    });
    const { edges } = buildDataflowGraph({
      apps: [owner, matcher, scorer],
      universe,
      complete: true,
    });
    expect(edges.some((e) => e.target === ANY_NAMESPACE_NODE_ID)).toBe(false);
  });
});
