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

/** Namespace and name of a BrokerApp. */
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

/**
 * Suffix the operator appends to an app's name for the secret holding its client
 * certificate (`common.AppCertSecretSuffix` in the operator). The process that
 * produces or consumes presents that certificate: it is the app's credential.
 */
export const APP_CERT_SECRET_SUFFIX = '-app-cert';

/**
 * The boxes. A namespace holds app boxes; an app box holds the addresses the app
 * owns and its credential, the certificate secret the producing or consuming
 * process presents, where every arrow of that app starts or ends. The secret is a
 * namespace object, but it belongs to the app, so it is drawn inside the app box.
 */
export type DataflowNode =
  | { id: string; kind: 'namespace'; namespace: string }
  | { id: string; kind: 'app'; namespace: string; name: string; parent: string }
  | {
      id: string;
      kind: 'credential';
      namespace: string;
      name: string;
      /** Name of the certificate secret the operator expects for this app. */
      secret: string;
      parent: string;
    }
  | { id: string; kind: 'anyApp'; namespace: string; parent: string }
  | { id: string; kind: 'anyNamespace' }
  | {
      id: string;
      kind: 'address';
      address: string;
      owner?: AppRef;
      /** The owner's app box, when the owner is known. */
      parent?: string;
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
export const namespaceNodeId = (namespace: string): string => `ns:${namespace}`;
export const appNodeId = (ref: AppRef): string => `app:${ref.namespace}/${ref.name}`;
export const credentialNodeId = (ref: AppRef): string => `cred:${ref.namespace}/${ref.name}`;
export const anyAppNodeId = (namespace: string): string => `any-app:${namespace}`;
export const addressNodeId = (address: string): string => `addr:${address}`;
export const gateNodeId = (address: string, role: GateRole): string => `gate:${role}:${address}`;

export const appRefOf = (app: BrokerAppCR): AppRef => ({
  namespace: app.metadata?.namespace ?? '',
  name: app.metadata?.name ?? '',
});

/**
 * Among `candidates`, the apps that reference an address one of `owners` owns. The
 * operator refuses a reference the owner's gate rejects before it binds the app, so
 * such an app never reaches a service's list of bound apps: a service page that
 * wants to show refused flows must look for these claimants itself.
 */
export const claimantsOf = (owners: BrokerAppCR[], candidates: BrokerAppCR[]): BrokerAppCR[] => {
  const ownerRefs = owners.map(appRefOf);
  const owned = new Set<string>();
  for (const owner of owners) {
    for (const entry of hydrateAddresses(owner)) {
      if (entry.kind === 'owned') owned.add(`${appNodeId(appRefOf(owner))}|${entry.address}`);
    }
  }
  return candidates.filter((candidate) => {
    const self = appRefOf(candidate);
    if (ownerRefs.some((o) => sameRef(o, self))) return false;
    return hydrateAddresses(candidate).some(
      (entry) =>
        entry.kind === 'referenced' &&
        !!entry.appName &&
        owned.has(
          `${appNodeId({ namespace: entry.appNamespace ?? self.namespace, name: entry.appName })}|${entry.address}`,
        ),
    );
  });
};

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
  credential: 2,
  anyApp: 3,
  anyNamespace: 4,
  address: 5,
  customGate: 6,
};

/**
 * Builds the boxes-and-arrows model of the messaging flows a set of BrokerApps
 * declare. An address box sits in its owner's app box, inside the owner's namespace
 * box; arrows start and end at an app's credential, the certificate secret its
 * process presents, drawn inside the app box. A gate pairs with
 * a declared flow by meaning: a realised gate disappears behind the declared arrow,
 * an unrealised one stays dashed, and its party is only drawn then.
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
  const ensureAppBox = (ref: AppRef): string => {
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
  const ensureCredential = (ref: AppRef): string => {
    const id = credentialNodeId(ref);
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        kind: 'credential',
        namespace: ref.namespace,
        name: ref.name,
        secret: `${ref.name}${APP_CERT_SECRET_SUFFIX}`,
        parent: ensureAppBox(ref),
      });
    }
    return id;
  };
  const ensureAnyApp = (namespace: string): string => {
    const id = anyAppNodeId(namespace);
    if (!nodes.has(id)) {
      nodes.set(id, { id, kind: 'anyApp', namespace, parent: ensureNamespace(namespace) });
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
      if (!existing.owner && owner) {
        existing.owner = owner;
        existing.parent = ensureAppBox(owner);
      }
      existing.pubSub = existing.pubSub || pubSub;
      return id;
    }
    nodes.set(id, {
      id,
      kind: 'address',
      address,
      owner,
      parent: owner ? ensureAppBox(owner) : undefined,
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

  // Namespaces that will hold app boxes: a whole-namespace gate lands on an any-app
  // box inside those, and on the namespace itself elsewhere.
  const groupedNamespaces = new Set<string>(drawnRefs.map((ref) => ref.namespace));
  for (const app of input.apps) {
    const self = appRefOf(app);
    for (const entry of hydrated(app)) {
      if (entry.kind === 'referenced' && entry.appName) {
        groupedNamespaces.add(entry.appNamespace ?? self.namespace);
      }
    }
  }

  // Pass 1: gates of the drawn apps' owned addresses. The party a gate admits is only
  // drawn in pass 3, if the gate arrow survives: a realised gate leaves no arrow, and
  // must leave no orphan box either.
  interface GateEdge {
    source: string;
    target: string;
    role: DataflowRole;
    address: string;
    owner: AppRef;
    principal?: GatePrincipal;
    ensureParty: () => void;
  }
  const gateEdges: GateEdge[] = [];
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
        const link = (partyId: string, ensureParty: () => void, principal?: GatePrincipal) => {
          gateEdges.push({
            source: role === 'produce' ? partyId : addressId,
            target: role === 'produce' ? addressId : partyId,
            role,
            address: entry.address,
            owner,
            principal,
            ensureParty,
          });
        };
        if (view.kind === 'custom') {
          const id = gateNodeId(entry.address, gateRole);
          link(id, () => {
            nodes.set(id, {
              id,
              kind: 'customGate',
              expression: view.expression,
              role: gateRole,
              address: entry.address,
            });
          });
          continue;
        }
        for (const principal of view.principals) {
          if (principal.appName) {
            const ref = { namespace: principal.namespace, name: principal.appName };
            groupedNamespaces.add(ref.namespace);
            link(credentialNodeId(ref), () => ensureCredential(ref), principal);
          } else if (principal.namespace === ANY_NAMESPACE) {
            link(ANY_NAMESPACE_NODE_ID, ensureAny, principal);
          } else if (groupedNamespaces.has(principal.namespace)) {
            link(
              anyAppNodeId(principal.namespace),
              () => ensureAnyApp(principal.namespace),
              principal,
            );
          } else {
            link(
              namespaceNodeId(principal.namespace),
              () => ensureNamespace(principal.namespace),
              principal,
            );
          }
        }
      }
    }
  }

  // Pass 2: declared flows, from the app's credential, checked against the owner's
  // gate when the address is referenced.
  const declared: { address: string; role: DataflowRole; app: AppRef }[] = [];
  for (const app of input.apps) {
    const ref = appRefOf(app);
    const credentialId = (): string => ensureCredential(ref);
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
        const [source, target] =
          role === 'produce' ? [credentialId(), addressId] : [addressId, credentialId()];
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
    gate.ensureParty();
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
    if (node.kind !== 'address' || !node.owner) continue;
    node.foreign = !isDrawn(node.owner);
    if (!node.gated) {
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
