import { evaluate } from 'cel-js';

/**
 * Namespace value of a principal that stands for every namespace on the cluster.
 * Produced when a gate admits a namespace the UI has never heard of, which only
 * happens for expressions such as `true` or a bare `app.metadata.name == 'x'`.
 */
export const ANY_NAMESPACE = '*';

/**
 * One party a gate lets in. The binding secret of a BrokerApp is namespace-scoped,
 * so a namespace is the real messaging principal; an app name narrows it further
 * when the owner wants to tell two apps of the same namespace apart.
 */
export interface GatePrincipal {
  namespace: string;
  appName?: string;
}

/**
 * What a gate means, as far as the UI can tell.
 * - `closed`: no expression, nobody but the owner may use the address in this role.
 * - `principals`: the exact parties the expression admits, found by evaluation.
 * - `custom`: the expression references data the UI cannot supply (labels, the
 *   service, namespace objects, unsupported functions); shown verbatim.
 */
export type GateView =
  | { kind: 'closed' }
  | { kind: 'principals'; principals: GatePrincipal[]; expression: string }
  | { kind: 'custom'; expression: string; error?: string };

/** The namespaces and BrokerApps the viewer can see, used as gate evaluation candidates. */
export interface GateUniverse {
  namespaces: string[];
  appsByNamespace: Record<string, string[]>;
}

/** `'unknown'` when the browser-side evaluator cannot decide; the operator's status is then the truth. */
export type GateVerdict = boolean | 'unknown';

const NAMESPACE_PATH = 'app.metadata.namespace';
const NAME_PATH = 'app.metadata.name';
const SENTINEL_NAMESPACE = '__dataflow-sentinel-namespace__';
const SENTINEL_APP = '__dataflow-sentinel-app__';

const celString = (value: string): string =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const oneOf = (path: string, values: string[]): string =>
  values.length === 1
    ? `${path} == ${celString(values[0])}`
    : `${path} in [${values.map(celString).join(', ')}]`;

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

/**
 * Writes the CEL gate the operator will evaluate for the given principals.
 * The output is canonical so that a gate written by the form reads back as the
 * same principals: namespaces first, then app-level clauses per namespace, sorted.
 * A whole-namespace principal absorbs app-level principals of the same namespace.
 *
 * @param principals - Parties to admit; empty closes the gate
 * @returns The CEL expression, or an empty string for a closed gate
 */
export const compileGate = (principals: GatePrincipal[]): string => {
  if (principals.some((p) => p.namespace === ANY_NAMESPACE && !p.appName)) {
    return 'true';
  }
  const wholeNamespaces = unique(
    principals.filter((p) => !p.appName).map((p) => p.namespace),
  ).sort();
  const whole = new Set(wholeNamespaces);
  const namesByNamespace = new Map<string, string[]>();
  for (const principal of principals) {
    if (!principal.appName || whole.has(principal.namespace)) continue;
    const names = namesByNamespace.get(principal.namespace) ?? [];
    if (!names.includes(principal.appName)) names.push(principal.appName);
    namesByNamespace.set(principal.namespace, names);
  }

  const clauses: string[] = [];
  if (wholeNamespaces.length) clauses.push(oneOf(NAMESPACE_PATH, wholeNamespaces));
  for (const namespace of Array.from(namesByNamespace.keys()).sort()) {
    const names = (namesByNamespace.get(namespace) ?? []).sort();
    clauses.push(
      namespace === ANY_NAMESPACE
        ? oneOf(NAME_PATH, names)
        : `${oneOf(NAMESPACE_PATH, [namespace])} && ${oneOf(NAME_PATH, names)}`,
    );
  }
  if (clauses.length <= 1) return clauses[0] ?? '';
  return clauses.map((clause) => (clause.includes('&&') ? `(${clause})` : clause)).join(' || ');
};

/** Evaluates the gate for one candidate; throws when the expression needs data we do not have. */
const admits = (expression: string, namespace: string, name: string): boolean => {
  const result: unknown = evaluate(expression, { app: { metadata: { namespace, name } } });
  if (typeof result !== 'boolean') {
    throw new Error(`Gate must evaluate to a boolean, got ${typeof result}`);
  }
  return result;
};

/** Quoted string literals of an expression, used only as extra evaluation candidates. */
const quotedLiterals = (expression: string): string[] => {
  const literals: string[] = [];
  const pattern = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let match = pattern.exec(expression);
  while (match !== null) {
    const text = (match[1] as string | undefined) ?? match[2];
    literals.push(text.replace(/\\(.)/g, '$1'));
    match = pattern.exec(expression);
  }
  return literals;
};

// Interpreting a gate evaluates it once per candidate party; a service with a thousand
// addresses would redo that on every render. Results are cached per expression and
// universe, with the oldest entries dropped once the cache grows past this size.
const INTERPRET_CACHE_LIMIT = 4096;
const interpretCache = new Map<string, GateView>();
let cachedUniverse: GateUniverse | undefined;
let cachedUniverseKey = '';

const universeKey = (universe: GateUniverse): string => {
  if (universe !== cachedUniverse) {
    cachedUniverse = universe;
    cachedUniverseKey = JSON.stringify([universe.namespaces, universe.appsByNamespace]);
  }
  return cachedUniverseKey;
};

/**
 * Recovers the parties a gate admits by evaluating it against every namespace and
 * app the viewer can see, plus the string literals the expression itself mentions,
 * so a gate to a namespace with no app yet is still drawn. Evaluation, not shape
 * parsing: `in`, `||`, `==` and any spelling of the same gate give the same answer.
 *
 * Limits, by design: an expression that admits an unknown namespace collapses to
 * `ANY_NAMESPACE` (so `!= 'x'` reads as "any namespace"), and `has()` on absent
 * fields evaluates to false rather than flagging the gate as custom.
 *
 * @param expression - Raw CEL from `producerOfAppSelector` or `consumerOfAppSelector`
 * @param universe - Candidate namespaces and apps
 */
export const interpretGate = (expression: string | undefined, universe: GateUniverse): GateView => {
  const expr = expression?.trim() ?? '';
  if (!expr) return { kind: 'closed' };
  const cacheKey = `${universeKey(universe)}\u0000${expr}`;
  const cached = interpretCache.get(cacheKey);
  if (cached) return cached;
  const view = interpretGateUncached(expr, universe);
  if (interpretCache.size >= INTERPRET_CACHE_LIMIT) {
    const oldest = interpretCache.keys().next().value;
    if (oldest !== undefined) interpretCache.delete(oldest);
  }
  interpretCache.set(cacheKey, view);
  return view;
};

const interpretGateUncached = (expr: string, universe: GateUniverse): GateView => {
  try {
    if (admits(expr, SENTINEL_NAMESPACE, SENTINEL_APP)) {
      return { kind: 'principals', principals: [{ namespace: ANY_NAMESPACE }], expression: expr };
    }
    const literals = quotedLiterals(expr);
    const anywhereApps = unique(literals)
      .sort()
      .filter((name) => admits(expr, SENTINEL_NAMESPACE, name));
    const principals: GatePrincipal[] = anywhereApps.map((appName) => ({
      namespace: ANY_NAMESPACE,
      appName,
    }));
    for (const namespace of unique([...universe.namespaces, ...literals]).sort()) {
      if (admits(expr, namespace, SENTINEL_APP)) {
        principals.push({ namespace });
        continue;
      }
      const names = unique([...(universe.appsByNamespace[namespace] ?? []), ...literals])
        .filter((name) => !anywhereApps.includes(name))
        .sort();
      for (const name of names) {
        if (admits(expr, namespace, name)) principals.push({ namespace, appName: name });
      }
    }
    return { kind: 'principals', principals, expression: expr };
  } catch (e) {
    return { kind: 'custom', expression: expr, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Tells whether a gate admits one specific app, the way the operator will check a
 * cross-app reference. A closed gate admits nobody.
 *
 * @param expression - The owner's gate for the role being requested
 * @param app - The requesting app's namespace and name
 */
export const evaluateGateFor = (
  expression: string | undefined,
  app: { namespace: string; name: string },
): GateVerdict => {
  const expr = expression?.trim() ?? '';
  if (!expr) return false;
  try {
    return admits(expr, app.namespace, app.name);
  } catch {
    return 'unknown';
  }
};
