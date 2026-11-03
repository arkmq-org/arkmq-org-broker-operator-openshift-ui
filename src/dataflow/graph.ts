import type { AddressSpec, BrokerAppCR } from '../k8s/types';
import { K8sResourceConditionStatus } from '../k8s/types';
import { hydrateAddresses, type Address, type GateRole } from '../reducers/brokerapp/reducer';
import {
  ANY_NAMESPACE,
  evaluateGateFor,
  interpretGate,
  type GatePrincipal,
  type GateUniverse,
} from './gates';

/** Namespace and name of a BrokerApp, the credential that declares a flow. */
export interface AppRef {
  namespace: string;
  name: string;
}

/** Direction of data on an edge: into an address or out of it. */
export type DataflowRole = 'produce' | 'consume';

/**
 * - `declared`: an app's capability says the flow exists.
 * - `allowed`: the owner's gate admits the party, and this graph cannot see whether
 *   anyone uses it (the form and the app page only draw one app).
 * - `broken`: declared, but the owner's gate refuses the declaring app; the operator
 *   will reject it.
 * - `unused`: admitted by a gate on a complete graph where nobody declares the flow,
 *   an open door.
 */
export type DataflowEdgeKind = 'declared' | 'allowed' | 'broken' | 'unused';

export interface DataflowInput {
  /** Apps whose capabilities and gates are drawn. */
  apps: BrokerAppCR[];
  /** Further apps that own addresses the drawn apps reference; used for gate checks and owner labels. */
  ownerApps?: BrokerAppCR[];
  universe: GateUniverse;
  /** True when `apps` is every app that can declare on these addresses, so an admitted party that declares nothing is an open door. */
  complete?: boolean;
}

/** Why an edge or an address deserves attention; rendered with i18n by the view. */
export type DataflowIssue =
  | { kind: 'ownerMissing'; owner: AppRef; address: string }
  | { kind: 'ownerNotDeclaring'; owner: AppRef; address: string }
  | { kind: 'refused'; owner: AppRef; app: AppRef; address: string; role: DataflowRole }
  | { kind: 'unknownGate'; owner: AppRef; address: string; role: DataflowRole }
  | { kind: 'notDeployed'; app: AppRef; message: string };

export type DataflowNode =
  | { id: string; kind: 'namespace'; namespace: string }
  | { id: string; kind: 'app'; namespace: string; name: string; parent: string }
  | { id: string; kind: 'anyNamespace' }
  | {
      id: string;
      kind: 'address';
      address: string;
      owner?: AppRef;
      /** Owned by an app this graph does not draw. */
      foreign: boolean;
      /** The owner opened at least one role to other apps. */
      gated: boolean;
      pubSub: boolean;
      issues: DataflowIssue[];
    }
  | { id: string; kind: 'customGate'; expression: string; role: GateRole; address: string };

export interface DataflowEdge {
  id: string;
  source: string;
  target: string;
  role: DataflowRole;
  kind: DataflowEdgeKind;
  /** Credentials declaring this flow; empty on gate edges. */
  apps: AppRef[];
  subscriptions: string[];
  issues: DataflowIssue[];
}

export interface DataflowGraph {
  nodes: DataflowNode[];
  edges: DataflowEdge[];
}

export const ANY_NAMESPACE_NODE_ID = 'any-namespace';
/** App name of the box standing for "any app of this namespace" inside a namespace group. */
export const ANY_APP = '*';
export const namespaceNodeId = (namespace: string): string => `ns:${namespace}`;
export const appNodeId = (ref: AppRef): string => `app:${ref.namespace}/${ref.name}`;
export const addressNodeId = (address: string): string => `addr:${address}`;
export const gateNodeId = (address: string, role: GateRole): string => `gate:${role}:${address}`;

export const appRefOf = (app: BrokerAppCR): AppRef => ({
  namespace: app.metadata?.namespace ?? '',
  name: app.metadata?.name ?? '',
});

/**
 * The apps owning the addresses an app references, deduplicated, so a page can watch
 * exactly those owners and nothing else.
 */
export const referencedOwnerRefs = (app: BrokerAppCR): AppRef[] => {
  const self = appRefOf(app);
  const owners: AppRef[] = [];
  for (const entry of hydrateAddresses(app)) {
    if (entry.kind !== 'referenced' || !entry.appName) continue;
    const owner = { namespace: entry.appNamespace ?? self.namespace, name: entry.appName };
    if (!owners.some((o) => o.namespace === owner.namespace && o.name === owner.name)) {
      owners.push(owner);
    }
  }
  return owners;
};

const sameRef = (a: AppRef, b: AppRef): boolean => a.namespace === b.namespace && a.name === b.name;

const roleOfGate = (role: GateRole): DataflowRole => (role === 'producer' ? 'produce' : 'consume');

const edgeId = (source: string, target: string, role: DataflowRole): string =>
  `${role}:${source}->${target}`;

const NODE_ORDER: Record<DataflowNode['kind'], number> = {
  namespace: 0,
  app: 1,
  anyNamespace: 2,
  address: 3,
  customGate: 4,
};

/**
 * Builds the boxes-and-arrows model of the messaging flows a set of BrokerApps
 * declare. Addresses are the boxes, namespaces the arrow ends (the binding secret is
 * namespace-scoped), apps a label on the arrows; an app only becomes a box when a
 * gate names it. Gate edges pair with declared edges by sharing their endpoints: a
 * realised gate disappears behind the declared flow, an unrealised one stays dashed.
 *
 * Pure: the same input always yields the same, sorted output, which dagre needs to
 * lay out the same picture twice.
 */
export const buildDataflowGraph = (input: DataflowInput): DataflowGraph => {
  const nodes = new Map<string, DataflowNode>();
  const edges = new Map<string, DataflowEdge>();

  const known: BrokerAppCR[] = [];
  for (const app of [...input.apps, ...(input.ownerApps ?? [])]) {
    if (!known.some((k) => sameRef(appRefOf(k), appRefOf(app)))) known.push(app);
  }
  const drawnRefs = input.apps.map(appRefOf);
  const isDrawn = (ref: AppRef): boolean => drawnRefs.some((d) => sameRef(d, ref));
  const findKnown = (ref: AppRef): BrokerAppCR | undefined =>
    known.find((k) => sameRef(appRefOf(k), ref));

  const hydratedByRef = new Map<string, Address[]>();
  const hydrated = (app: BrokerAppCR): Address[] => {
    const key = appNodeId(appRefOf(app));
    let list = hydratedByRef.get(key);
    if (!list) {
      list = hydrateAddresses(app);
      hydratedByRef.set(key, list);
    }
    return list;
  };

  // The owner's declaration of an address, explicit or implied by a capability without appName.
  const ownedSpec = (owner: AppRef, address: string): AddressSpec | undefined => {
    const app = findKnown(owner);
    if (!app) return undefined;
    const explicit = app.spec.addresses?.find((a) => a.address === address);
    if (explicit) return explicit;
    const implicit = hydrated(app).find((a) => a.address === address && a.kind === 'owned');
    return implicit ? { address, ...(implicit.pubSub ? { pubSub: true } : {}) } : undefined;
  };

  const ensureNamespace = (namespace: string): string => {
    const id = namespaceNodeId(namespace);
    if (!nodes.has(id)) nodes.set(id, { id, kind: 'namespace', namespace });
    return id;
  };
  const ensureApp = (ref: AppRef): string => {
    const id = appNodeId(ref);
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: 'app',
        namespace: ref.namespace,
        name: ref.name,
        parent: ensureNamespace(ref.namespace),
      });
    }
    return id;
  };
  const ensureAny = (): string => {
    if (!nodes.has(ANY_NAMESPACE_NODE_ID)) {
      nodes.set(ANY_NAMESPACE_NODE_ID, { id: ANY_NAMESPACE_NODE_ID, kind: 'anyNamespace' });
    }
    return ANY_NAMESPACE_NODE_ID;
  };
  const ensureAddress = (address: string, owner: AppRef | undefined, pubSub: boolean): string => {
    const id = addressNodeId(address);
    const existing = nodes.get(id);
    if (existing?.kind === 'address') {
      if (!existing.owner && owner) existing.owner = owner;
      existing.pubSub = existing.pubSub || pubSub;
      return id;
    }
    nodes.set(id, {
      id,
      kind: 'address',
      address,
      owner,
      foreign: false,
      gated: false,
      pubSub,
      issues: [],
    });
    return id;
  };
  const addressIssue = (address: string, issue: DataflowIssue): void => {
    const node = nodes.get(addressNodeId(address));
    if (node?.kind === 'address') node.issues.push(issue);
  };

  const mergeEdge = (edge: DataflowEdge): void => {
    const existing = edges.get(edge.id);
    if (!existing) {
      edges.set(edge.id, edge);
      return;
    }
    if (edge.kind === 'broken') existing.kind = 'broken';
    for (const app of edge.apps) {
      if (!existing.apps.some((a) => sameRef(a, app))) existing.apps.push(app);
    }
    for (const sub of edge.subscriptions) {
      if (!existing.subscriptions.includes(sub)) existing.subscriptions.push(sub);
    }
    existing.issues.push(...edge.issues);
  };

  // Pass 1: gates of the drawn apps' owned addresses create the parties they admit.
  // A namespace that gets an app box becomes a group, and react-topology cannot
  // anchor an edge on a group: every later flow in that namespace lands on a box.
  interface GateEdge {
    source: string;
    target: string;
    role: DataflowRole;
    address: string;
    owner: AppRef;
    principal?: GatePrincipal;
  }
  const gateEdges: GateEdge[] = [];
  const groupedNamespaces = new Set<string>();
  const ensureAppBox = (ref: AppRef): string => {
    groupedNamespaces.add(ref.namespace);
    return ensureApp(ref);
  };
  for (const app of input.apps) {
    const owner = appRefOf(app);
    for (const entry of hydrated(app)) {
      if (entry.kind !== 'owned') continue;
      const addressId = ensureAddress(entry.address, owner, !!entry.pubSub);
      const gates: [GateRole, string | undefined][] = [
        ['producer', entry.producerGate],
        ['consumer', entry.consumerGate],
      ];
      for (const [gateRole, expression] of gates) {
        const view = interpretGate(expression, input.universe);
        if (view.kind === 'closed') continue;
        const node = nodes.get(addressId);
        if (node?.kind === 'address') node.gated = true;
        const role = roleOfGate(gateRole);
        if (view.kind === 'custom') {
          const id = gateNodeId(entry.address, gateRole);
          nodes.set(id, {
            id,
            kind: 'customGate',
            expression: view.expression,
            role: gateRole,
            address: entry.address,
          });
          gateEdges.push(
            role === 'produce'
              ? { source: id, target: addressId, role, address: entry.address, owner }
              : { source: addressId, target: id, role, address: entry.address, owner },
          );
          continue;
        }
        for (const principal of view.principals) {
          gateEdges.push({
            source: '',
            target: '',
            role,
            address: entry.address,
            owner,
            principal,
          });
          if (principal.appName) {
            ensureAppBox({ namespace: principal.namespace, name: principal.appName });
          }
        }
      }
    }
  }
  // Whole-namespace principals resolve once every grouped namespace is known.
  for (const gate of gateEdges) {
    if (!gate.principal) continue;
    const { principal } = gate;
    const partyId = principal.appName
      ? appNodeId({ namespace: principal.namespace, name: principal.appName })
      : principal.namespace === ANY_NAMESPACE
        ? ensureAny()
        : groupedNamespaces.has(principal.namespace)
          ? ensureApp({ namespace: principal.namespace, name: ANY_APP })
          : ensureNamespace(principal.namespace);
    const addressId = addressNodeId(gate.address);
    if (gate.role === 'produce') {
      gate.source = partyId;
      gate.target = addressId;
    } else {
      gate.source = addressId;
      gate.target = partyId;
    }
  }

  // Pass 2: declared flows, checked against the owner's gate when the address is referenced.
  const declared: { address: string; role: DataflowRole; app: AppRef }[] = [];
  for (const app of input.apps) {
    const ref = appRefOf(app);
    const failure = app.status?.conditions?.find(
      (c) => c.type === 'Deployed' && c.status === K8sResourceConditionStatus.False,
    )?.message;
    for (const entry of hydrated(app)) {
      if (entry.direction === 'none') continue;
      const owner: AppRef | undefined =
        entry.kind === 'owned'
          ? ref
          : entry.appName
            ? { namespace: entry.appNamespace ?? ref.namespace, name: entry.appName }
            : undefined;
      const spec = owner ? ownedSpec(owner, entry.address) : undefined;
      const addressId = ensureAddress(entry.address, owner, !!entry.pubSub || !!spec?.pubSub);
      const partyId =
        nodes.has(appNodeId(ref)) || groupedNamespaces.has(ref.namespace)
          ? ensureApp(ref)
          : ensureNamespace(ref.namespace);

      const roles: DataflowRole[] = [];
      if (entry.direction === 'produces' || entry.direction === 'both') roles.push('produce');
      if (entry.direction === 'consumes' || entry.direction === 'both') roles.push('consume');

      const ownerIssue: DataflowIssue | undefined =
        owner && !sameRef(owner, ref) && !spec
          ? findKnown(owner)
            ? { kind: 'ownerNotDeclaring', owner, address: entry.address }
            : { kind: 'ownerMissing', owner, address: entry.address }
          : undefined;
      if (ownerIssue) addressIssue(entry.address, ownerIssue);

      for (const role of roles) {
        declared.push({ address: entry.address, role, app: ref });
        const [source, target] = role === 'produce' ? [partyId, addressId] : [addressId, partyId];
        const issues: DataflowIssue[] = [];
        let kind: DataflowEdgeKind = 'declared';
        if (owner && !sameRef(owner, ref)) {
          if (ownerIssue) {
            issues.push(ownerIssue);
          } else {
            const gate =
              role === 'produce' ? spec?.producerOfAppSelector : spec?.consumerOfAppSelector;
            const verdict = evaluateGateFor(gate, ref);
            if (verdict === false) {
              kind = 'broken';
              issues.push({ kind: 'refused', owner, app: ref, address: entry.address, role });
            } else if (verdict === 'unknown') {
              issues.push({ kind: 'unknownGate', owner, address: entry.address, role });
            }
          }
        }
        if (failure) issues.push({ kind: 'notDeployed', app: ref, message: failure });
        mergeEdge({
          id: edgeId(source, target, role),
          source,
          target,
          role,
          kind,
          apps: [ref],
          subscriptions: role === 'consume' ? [...(entry.subscriptions ?? [])] : [],
          issues,
        });
      }
    }
  }

  // Pass 3: a gate is realised when some other app declares the flow it allows; the
  // declared arrow then tells the story and the gate disappears. The others stay
  // dashed, as open doors when the graph is complete.
  const covers = (principal: GatePrincipal, app: AppRef): boolean =>
    (principal.namespace === ANY_NAMESPACE || principal.namespace === app.namespace) &&
    (!principal.appName || principal.appName === app.name);
  for (const gate of gateEdges) {
    const id = edgeId(gate.source, gate.target, gate.role);
    if (edges.has(id)) continue;
    const { principal } = gate;
    const realised =
      !!principal &&
      declared.some(
        (flow) =>
          flow.address === gate.address &&
          flow.role === gate.role &&
          !sameRef(flow.app, gate.owner) &&
          covers(principal, flow.app),
      );
    if (realised) continue;
    edges.set(id, {
      id,
      source: gate.source,
      target: gate.target,
      role: gate.role,
      kind: input.complete && principal ? 'unused' : 'allowed',
      apps: [],
      subscriptions: [],
      issues: [],
    });
  }

  for (const node of Array.from(nodes.values())) {
    if (node.kind === 'address' && node.owner) node.foreign = !isDrawn(node.owner);
    if (node.kind === 'address' && node.owner && !node.gated) {
      const spec = ownedSpec(node.owner, node.address);
      node.gated = Boolean(spec?.producerOfAppSelector) || Boolean(spec?.consumerOfAppSelector);
    }
  }

  return {
    nodes: Array.from(nodes.values()).sort(
      (a, b) => NODE_ORDER[a.kind] - NODE_ORDER[b.kind] || a.id.localeCompare(b.id),
    ),
    edges: Array.from(edges.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
};
