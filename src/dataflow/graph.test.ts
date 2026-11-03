import type { BrokerAppCR } from '../k8s/types';
import { K8sResourceConditionStatus } from '../k8s/types';
import type { GateUniverse } from './gates';
import {
  ANY_NAMESPACE_NODE_ID,
  addressNodeId,
  anyAppNodeId,
  appNodeId,
  buildDataflowGraph,
  credentialNodeId,
  gateNodeId,
  namespaceNodeId,
  referencedOwnerRefs,
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
  options: { deployedMessage?: string; secret?: string } = {},
): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace },
  spec: { serviceSelector: {}, ...spec },
  status: {
    ...(options.secret
      ? {
          service: {
            name: 'core-prd',
            namespace: 'acme-platform',
            assignedPort: 1,
            secret: options.secret,
          },
        }
      : {}),
    conditions: [
      options.deployedMessage
        ? {
            type: 'Deployed',
            status: K8sResourceConditionStatus.False,
            reason: 'ValidationFailed',
            message: options.deployedMessage,
          }
        : { type: 'Deployed', status: K8sResourceConditionStatus.True },
    ],
  },
});

const ref = (namespace: string, name: string) => ({ namespace, name });
const CAPTURE = ref('acme-enroll', 'capture');
const SCORER = ref('acme-enroll', 'scorer');
const MATCHER = ref('acme-ident', 'matcher');

// The acme tutorial: capture -> ENROLL.IN -> scorer -> IDENT.REQUEST -> matcher
const capture = app(
  'acme-enroll',
  'capture',
  {
    addresses: [
      {
        address: 'ENROLL.IN',
        consumerOfAppSelector:
          "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
      },
    ],
    capabilities: [{ producerOf: [{ address: 'ENROLL.IN' }] }],
  },
  { secret: 'capture-binding-secret' },
);
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

describe('referencedOwnerRefs', () => {
  it('lists each owner of a referenced address once', () => {
    expect(referencedOwnerRefs(matcher)).toEqual([SCORER]);
    expect(referencedOwnerRefs(capture)).toEqual([]);
  });
});

describe('buildDataflowGraph on a single app (form and app page)', () => {
  it('nests the boxes: namespace holds the app box and the credential, the app box its address', () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [capture], universe });
    expect(byId(nodes, appNodeId(CAPTURE))).toMatchObject({
      kind: 'app',
      parent: namespaceNodeId('acme-enroll'),
    });
    expect(byId(nodes, credentialNodeId(CAPTURE))).toMatchObject({
      kind: 'credential',
      secret: 'capture-app-cert',
      parent: namespaceNodeId('acme-enroll'),
    });
    expect(byId(nodes, addressNodeId('ENROLL.IN'))).toMatchObject({
      kind: 'address',
      owner: CAPTURE,
      parent: appNodeId(CAPTURE),
      foreign: false,
      gated: true,
    });
    expect(edges).toContainEqual(
      expect.objectContaining({
        source: credentialNodeId(CAPTURE),
        target: addressNodeId('ENROLL.IN'),
        role: 'produce',
        kind: 'declared',
        apps: [CAPTURE],
      }),
    );
  });

  it('names the certificate secret the operator expects for the app', () => {
    const { nodes } = buildDataflowGraph({ apps: [scorer], universe });
    expect(byId(nodes, credentialNodeId(SCORER))).toMatchObject({
      kind: 'credential',
      secret: 'scorer-app-cert',
    });
  });

  it("draws an app-level gate as a dashed arrow to that app's credential, in its namespace", () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [capture], universe });
    expect(byId(nodes, credentialNodeId(SCORER))).toMatchObject({
      kind: 'credential',
      parent: namespaceNodeId('acme-enroll'),
    });
    // scorer owns nothing here, so it has no app box of its own
    expect(byId(nodes, appNodeId(SCORER))).toBeUndefined();
    expect(edgesOfKind(edges, 'allowed')).toEqual([
      expect.objectContaining({
        source: addressNodeId('ENROLL.IN'),
        target: credentialNodeId(SCORER),
        role: 'consume',
      }),
    ]);
  });

  it("draws a referenced address inside its owner's box, foreign, when the owner is supplied", () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [matcher], ownerApps: [scorer], universe });
    expect(byId(nodes, addressNodeId('IDENT.REQUEST'))).toMatchObject({
      owner: SCORER,
      parent: appNodeId(SCORER),
      foreign: true,
      gated: true,
      issues: [],
    });
    // the owner is only a box here: it is not drawn, so it has no credential
    expect(byId(nodes, credentialNodeId(SCORER))).toBeUndefined();
    expect(edges).toEqual([
      expect.objectContaining({
        source: addressNodeId('IDENT.REQUEST'),
        target: credentialNodeId(MATCHER),
        role: 'consume',
        kind: 'declared',
        issues: [],
      }),
    ]);
  });

  it('flags a referenced address whose owner cannot be seen', () => {
    const { nodes, edges } = buildDataflowGraph({ apps: [matcher], universe });
    expect(byId(nodes, addressNodeId('IDENT.REQUEST'))).toMatchObject({
      parent: appNodeId(SCORER),
      issues: [{ kind: 'ownerMissing', owner: SCORER, address: 'IDENT.REQUEST' }],
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

  it('draws a gate to a namespace that holds no box as a plain namespace', () => {
    const owner = app('acme-enroll', 'capture', {
      addresses: [
        { address: 'ENROLL.IN', consumerOfAppSelector: "app.metadata.namespace == 'acme-notify'" },
      ],
    });
    const { nodes, edges } = buildDataflowGraph({ apps: [owner], universe });
    expect(byId(nodes, namespaceNodeId('acme-notify'))).toMatchObject({ kind: 'namespace' });
    expect(edges[0]).toMatchObject({ target: namespaceNodeId('acme-notify'), kind: 'allowed' });
  });

  it('treats a capability without appName as an owned address', () => {
    const implicit = app('acme-enroll', 'loop', {
      capabilities: [{ producerOf: [{ address: 'LOOP' }], consumerOf: [{ address: 'LOOP' }] }],
    });
    const { nodes, edges } = buildDataflowGraph({ apps: [implicit], universe });
    expect(byId(nodes, addressNodeId('LOOP'))).toMatchObject({
      owner: ref('acme-enroll', 'loop'),
      parent: appNodeId(ref('acme-enroll', 'loop')),
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

  it('draws the tutorial chain between credentials with every gate realised', () => {
    const { edges } = buildDataflowGraph(service);
    expect(edgesOfKind(edges, 'allowed')).toEqual([]);
    expect(edgesOfKind(edges, 'unused')).toEqual([]);
    expect(edgesOfKind(edges, 'broken')).toEqual([]);
    expect(edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(
      [
        `${credentialNodeId(CAPTURE)}>${addressNodeId('ENROLL.IN')}`,
        `${addressNodeId('ENROLL.IN')}>${credentialNodeId(SCORER)}`,
        `${credentialNodeId(SCORER)}>${addressNodeId('IDENT.REQUEST')}`,
        `${addressNodeId('IDENT.REQUEST')}>${credentialNodeId(MATCHER)}`,
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
      {
        deployedMessage:
          "referenced app acme-enroll/capture does not share address 'ENROLL.IN' for role 'consumer'",
      },
    );
    const { edges } = buildDataflowGraph({ ...service, apps: [...service.apps, intruder] });
    const broken = edgesOfKind(edges, 'broken');
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({
      source: addressNodeId('ENROLL.IN'),
      target: credentialNodeId(ref('acme-ident', 'intruder')),
      apps: [ref('acme-ident', 'intruder')],
    });
    expect(broken[0].issues.map((issue) => issue.kind)).toEqual(['refused', 'notDeployed']);
    const notDeployed = broken[0].issues[1];
    expect(notDeployed.kind === 'notDeployed' ? notDeployed.message : '').toContain(
      'does not share',
    );
  });

  it('marks an admitted party that declares nothing as an open door, on an any-app box', () => {
    // acme-ident holds matcher's box only when matcher is drawn; without it, the
    // namespace holds nothing and the gate lands on the namespace itself.
    const { edges, nodes } = buildDataflowGraph({ ...service, apps: [capture, scorer] });
    expect(edgesOfKind(edges, 'unused')).toEqual([
      expect.objectContaining({
        source: addressNodeId('IDENT.REQUEST'),
        target: namespaceNodeId('acme-ident'),
        role: 'consume',
      }),
    ]);
    expect(byId(nodes, namespaceNodeId('acme-ident'))).toMatchObject({ kind: 'namespace' });
  });

  it('lands an open door on an any-app box when the namespace holds app boxes', () => {
    const idle = app('acme-ident', 'idle', {});
    const { edges, nodes } = buildDataflowGraph({ ...service, apps: [capture, scorer, idle] });
    expect(byId(nodes, anyAppNodeId('acme-ident'))).toMatchObject({
      kind: 'anyApp',
      parent: namespaceNodeId('acme-ident'),
    });
    expect(edgesOfKind(edges, 'unused')).toEqual([
      expect.objectContaining({ target: anyAppNodeId('acme-ident') }),
    ]);
  });

  it('leaves no any-app box behind when a whole-namespace gate is realised', () => {
    const owner = app('acme-ident', 'matcher', {
      addresses: [
        {
          address: 'IDENT.RESULTS',
          pubSub: true,
          consumerOfAppSelector: "app.metadata.namespace == 'acme-ident'",
        },
      ],
      capabilities: [{ producerOf: [{ address: 'IDENT.RESULTS', pubSub: true }] }],
    });
    const reader = app('acme-ident', 'registry-sync', {
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
    const { nodes, edges } = buildDataflowGraph({
      apps: [owner, reader],
      universe,
      complete: true,
    });
    expect(byId(nodes, anyAppNodeId('acme-ident'))).toBeUndefined();
    expect(edgesOfKind(edges, 'unused')).toEqual([]);
  });

  it('pairs an app-level gate only with that app, not with its namespace siblings', () => {
    const sibling = app('acme-enroll', 'auditor', {
      capabilities: [
        { consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }] },
      ],
    });
    const { edges } = buildDataflowGraph({ apps: [capture, sibling], universe, complete: true });
    expect(edgesOfKind(edges, 'unused')).toHaveLength(1);
    expect(edgesOfKind(edges, 'broken')).toHaveLength(1);
  });

  it('merges several credentials onto one arrow only when they are the same party', () => {
    // two apps of one namespace are two credentials, hence two arrows
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
    const fromIdentRequest = edges.filter((e) => e.source === addressNodeId('IDENT.REQUEST'));
    expect(fromIdentRequest.map((e) => e.target).sort()).toEqual(
      [credentialNodeId(MATCHER), credentialNodeId(ref('acme-ident', 'auditor'))].sort(),
    );
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
