import {
  ANY_NAMESPACE,
  compileGate,
  evaluateGateFor,
  interpretGate,
  type GateUniverse,
} from './gates';

const universe: GateUniverse = {
  namespaces: ['acme-enroll', 'acme-ident', 'acme-notify', 'empty-ns'],
  appsByNamespace: {
    'acme-enroll': ['capture', 'scorer'],
    'acme-ident': ['matcher'],
    'acme-notify': ['notifier'],
  },
};

describe('compileGate', () => {
  it('returns an empty expression for no principals', () => {
    expect(compileGate([])).toBe('');
  });

  it('writes a single namespace as an equality', () => {
    expect(compileGate([{ namespace: 'acme-ident' }])).toBe(
      "app.metadata.namespace == 'acme-ident'",
    );
  });

  it('writes several namespaces as a sorted list membership', () => {
    expect(compileGate([{ namespace: 'acme-notify' }, { namespace: 'acme-ident' }])).toBe(
      "app.metadata.namespace in ['acme-ident', 'acme-notify']",
    );
  });

  it('writes an app-level principal as the tutorial does', () => {
    expect(compileGate([{ namespace: 'acme-enroll', appName: 'scorer' }])).toBe(
      "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
    );
  });

  it('parenthesises app-level clauses when combined with namespaces', () => {
    expect(
      compileGate([
        { namespace: 'acme-notify' },
        { namespace: 'acme-enroll', appName: 'scorer' },
        { namespace: 'acme-enroll', appName: 'capture' },
      ]),
    ).toBe(
      "app.metadata.namespace == 'acme-notify' || (app.metadata.namespace == 'acme-enroll' && app.metadata.name in ['capture', 'scorer'])",
    );
  });

  it('lets a whole-namespace principal absorb app-level ones of the same namespace', () => {
    expect(
      compileGate([{ namespace: 'acme-enroll' }, { namespace: 'acme-enroll', appName: 'scorer' }]),
    ).toBe("app.metadata.namespace == 'acme-enroll'");
  });

  it('writes an app admitted from any namespace on the name alone', () => {
    expect(compileGate([{ namespace: ANY_NAMESPACE, appName: 'scorer' }])).toBe(
      "app.metadata.name == 'scorer'",
    );
  });

  it('writes everyone as true', () => {
    expect(compileGate([{ namespace: ANY_NAMESPACE }, { namespace: 'acme-ident' }])).toBe('true');
  });

  it('escapes quotes in names', () => {
    expect(compileGate([{ namespace: "it's" }])).toBe("app.metadata.namespace == 'it\\'s'");
  });

  it.each([
    [[{ namespace: 'acme-ident' }]],
    [[{ namespace: 'acme-ident' }, { namespace: 'acme-notify' }]],
    [[{ namespace: 'acme-enroll', appName: 'scorer' }]],
    [[{ namespace: 'acme-notify' }, { namespace: 'acme-enroll', appName: 'scorer' }]],
    [[{ namespace: ANY_NAMESPACE, appName: 'scorer' }]],
  ])('round-trips %j through interpretGate', (principals) => {
    const view = interpretGate(compileGate(principals), universe);
    expect(view.kind).toBe('principals');
    if (view.kind === 'principals') {
      expect(view.principals).toEqual(expect.arrayContaining(principals));
      expect(view.principals).toHaveLength(principals.length);
    }
  });
});

describe('interpretGate', () => {
  it('reads an empty or blank expression as closed', () => {
    expect(interpretGate(undefined, universe)).toEqual({ kind: 'closed' });
    expect(interpretGate('   ', universe)).toEqual({ kind: 'closed' });
  });

  it('recovers a namespace whatever the spelling', () => {
    expect(interpretGate("'acme-ident' == app.metadata.namespace", universe)).toEqual({
      kind: 'principals',
      principals: [{ namespace: 'acme-ident' }],
      expression: "'acme-ident' == app.metadata.namespace",
    });
  });

  it('recovers a list membership as several namespaces', () => {
    const view = interpretGate("app.metadata.namespace in ['acme-ident', 'acme-notify']", universe);
    expect(view.kind === 'principals' && view.principals).toEqual([
      { namespace: 'acme-ident' },
      { namespace: 'acme-notify' },
    ]);
  });

  it('draws a gate to a namespace that hosts no app yet, from the literal', () => {
    const view = interpretGate("app.metadata.namespace == 'future-team'", universe);
    expect(view.kind === 'principals' && view.principals).toEqual([{ namespace: 'future-team' }]);
  });

  it('recovers an app-level principal without listing its siblings', () => {
    const view = interpretGate(
      "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
      universe,
    );
    expect(view.kind === 'principals' && view.principals).toEqual([
      { namespace: 'acme-enroll', appName: 'scorer' },
    ]);
  });

  it('recovers a mixed expression as one app box and one whole namespace', () => {
    const view = interpretGate(
      "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer' || app.metadata.namespace == 'acme-ident'",
      universe,
    );
    expect(view.kind === 'principals' && view.principals).toEqual([
      { namespace: 'acme-enroll', appName: 'scorer' },
      { namespace: 'acme-ident' },
    ]);
  });

  it('reads a name-only gate as that app in any namespace, once', () => {
    const view = interpretGate("app.metadata.name == 'scorer'", universe);
    expect(view.kind === 'principals' && view.principals).toEqual([
      { namespace: ANY_NAMESPACE, appName: 'scorer' },
    ]);
  });

  it('reads true as everyone', () => {
    const view = interpretGate('true', universe);
    expect(view.kind === 'principals' && view.principals).toEqual([{ namespace: ANY_NAMESPACE }]);
  });

  it('reads an expression that admits nobody visible as open to no one', () => {
    const view = interpretGate('false', universe);
    expect(view.kind === 'principals' && view.principals).toEqual([]);
  });

  it('flags a gate on labels as custom', () => {
    const view = interpretGate("app.metadata.labels['tier'] == 'prd'", universe);
    expect(view.kind).toBe('custom');
  });

  it('flags a gate on the namespace object as custom', () => {
    const view = interpretGate("appNamespace.metadata.labels['team'] == 'core'", universe);
    expect(view.kind).toBe('custom');
  });

  it('flags an unsupported function as custom', () => {
    expect(interpretGate("app.metadata.namespace.startsWith('acme-')", universe).kind).toBe(
      'custom',
    );
  });

  it('flags a non-boolean expression as custom', () => {
    expect(interpretGate('1 + 1', universe).kind).toBe('custom');
  });

  it('flags a syntax error as custom and keeps the text', () => {
    const view = interpretGate("app.metadata.namespace == 'x", universe);
    expect(view).toMatchObject({ kind: 'custom', expression: "app.metadata.namespace == 'x" });
  });
});

describe('interpretGate caching', () => {
  it('returns the same view object for the same gate and universe', () => {
    const a = interpretGate("app.metadata.namespace == 'acme-ident'", universe);
    const b = interpretGate("app.metadata.namespace == 'acme-ident'", universe);
    expect(b).toBe(a);
  });

  it('re-evaluates when the universe changes', () => {
    const before = interpretGate('app.metadata.name == "scorer" || false', universe);
    const bigger: GateUniverse = {
      ...universe,
      namespaces: [...universe.namespaces, 'acme-new'],
      appsByNamespace: { ...universe.appsByNamespace, 'acme-new': ['scorer'] },
    };
    const after = interpretGate('app.metadata.name == "scorer" || false', bigger);
    expect(after).not.toBe(before);
    // a name-only gate still collapses to "scorer anywhere", whatever the universe
    expect(after.kind === 'principals' && after.principals).toEqual([
      { namespace: ANY_NAMESPACE, appName: 'scorer' },
    ]);
  });
});

describe('evaluateGateFor', () => {
  const scorer = { namespace: 'acme-enroll', name: 'scorer' };

  it('refuses everyone on a closed gate', () => {
    expect(evaluateGateFor(undefined, scorer)).toBe(false);
    expect(evaluateGateFor('', scorer)).toBe(false);
  });

  it('admits the app the tutorial gate names', () => {
    expect(
      evaluateGateFor(
        "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
        scorer,
      ),
    ).toBe(true);
  });

  it('refuses an app of the same namespace with another name', () => {
    expect(
      evaluateGateFor("app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'", {
        namespace: 'acme-enroll',
        name: 'intruder',
      }),
    ).toBe(false);
  });

  it('cannot decide a gate on data the browser lacks', () => {
    expect(evaluateGateFor("app.metadata.labels['tier'] == 'prd'", scorer)).toBe('unknown');
  });
});
