import * as jsYaml from 'js-yaml';
import type { BrokerAppCR, BrokerService } from '../k8s/types';
import {
  validateDNS1123,
  validateDuplicateAddressEntries,
  validateEnvVarEntries,
  validateLabelEntries,
  validateRequiredLabels,
  validateRequiredMatchLabels,
  validateMemoryValue,
  validateCpuQuantity,
  validateMemoryQuantity,
  validateNoDuplicateAddresses,
  validateNoAddressOverlap,
  validateAddressEntries,
  validateYamlDuplicateBrokerServiceLabels,
  validateYamlDuplicateBrokerAppMatchLabels,
  validateBrokerAppCR,
  validateBrokerServiceCR,
} from './k8s';

describe('validateDNS1123', () => {
  it('returns error when value is empty', () => {
    expect(validateDNS1123('')).toBe('Name is required');
  });

  it('returns null for a valid lowercase name', () => {
    expect(validateDNS1123('my-broker-app')).toBeNull();
  });

  it('returns null for a single alphanumeric character', () => {
    expect(validateDNS1123('a')).toBeNull();
  });

  it('returns null for a valid multi-label name with dots', () => {
    expect(validateDNS1123('my.broker.app')).toBeNull();
  });

  it('returns error when name exceeds 253 characters', () => {
    expect(validateDNS1123('a'.repeat(254))).toBe('Name must be 253 characters or fewer');
  });

  it('accepts exactly 253 characters', () => {
    expect(validateDNS1123('a'.repeat(253))).toBeNull();
  });

  it('returns error when name contains uppercase letters', () => {
    expect(validateDNS1123('MyApp')).not.toBeNull();
  });

  it('returns error when name starts with a hyphen', () => {
    expect(validateDNS1123('-my-app')).not.toBeNull();
  });

  it('returns error when name ends with a hyphen', () => {
    expect(validateDNS1123('my-app-')).not.toBeNull();
  });

  it('returns error when name contains invalid characters', () => {
    expect(validateDNS1123('my_app')).not.toBeNull();
  });

  it('returns error when name starts with a digit followed by invalid content', () => {
    expect(validateDNS1123('1-UPPER')).not.toBeNull();
  });

  it('returns null for name starting and ending with digits', () => {
    expect(validateDNS1123('1broker2')).toBeNull();
  });
});

describe('validateMemoryValue', () => {
  it('returns error when value is empty', () => {
    expect(validateMemoryValue('')).toBe('Memory value is required');
  });

  it('returns null for a valid positive integer', () => {
    expect(validateMemoryValue('2')).toBeNull();
  });

  it('returns null for a valid positive decimal', () => {
    expect(validateMemoryValue('2.5')).toBeNull();
  });

  it('returns error when value is not a number', () => {
    expect(validateMemoryValue('abc')).toBe('Memory value must be a number');
  });

  it('returns error when value is zero', () => {
    expect(validateMemoryValue('0')).toBe('Memory value must be greater than 0');
  });

  it('returns error when value is negative', () => {
    expect(validateMemoryValue('-1')).toBe('Memory value must be greater than 0');
  });
});

describe('validateRequiredLabels', () => {
  it('returns null when at least one entry has a non-empty key', () => {
    expect(validateRequiredLabels([{ key: 'app.kubernetes.io/instance' }])).toBeNull();
  });

  it('returns null when some entries are blank but at least one has a key', () => {
    expect(validateRequiredLabels([{ key: '' }, { key: 'tier' }])).toBeNull();
  });

  it('returns error when all entries have empty keys', () => {
    expect(validateRequiredLabels([{ key: '' }])).toBe('At least one label is required');
  });

  it('returns error when entries array is empty', () => {
    expect(validateRequiredLabels([])).toBe('At least one label is required');
  });

  it('returns error when all keys are whitespace-only', () => {
    expect(validateRequiredLabels([{ key: '   ' }])).toBe('At least one label is required');
  });
});

describe('validateRequiredMatchLabels', () => {
  it('returns null when at least one entry has a non-empty key', () => {
    expect(validateRequiredMatchLabels([{ key: 'app.kubernetes.io/instance' }])).toBeNull();
  });

  it('returns error when all entries have empty keys', () => {
    expect(validateRequiredMatchLabels([{ key: '' }])).toBe('At least one match label is required');
  });

  it('returns error when entries array is empty', () => {
    expect(validateRequiredMatchLabels([])).toBe('At least one match label is required');
  });
});

describe('validateLabelEntries', () => {
  it('returns null when all keys are unique', () => {
    expect(
      validateLabelEntries([
        { key: 'app', value: 'messaging' },
        { key: 'forWorkQueue', value: 'true' },
      ]),
    ).toBeNull();
  });

  it('returns null when entries have empty keys', () => {
    expect(
      validateLabelEntries([
        { key: '', value: 'ignored' },
        { key: 'app', value: 'messaging' },
      ]),
    ).toBeNull();
  });

  it('returns error when duplicate non-empty keys exist', () => {
    expect(
      validateLabelEntries([
        { key: 'key1', value: 'one' },
        { key: 'key1', value: 'two' },
      ]),
    ).toBe('Duplicate label key "key1"');
  });
});

describe('validateEnvVarEntries', () => {
  it('returns null when all names are unique', () => {
    expect(
      validateEnvVarEntries([
        { name: 'BROKER_MAX_CONNECTIONS', value: '1000' },
        { name: 'BROKER_LOG_LEVEL', value: 'debug' },
      ]),
    ).toBeNull();
  });

  it('returns null when entries have empty names', () => {
    expect(
      validateEnvVarEntries([
        { name: '', value: 'ignored' },
        { name: 'BROKER_LOG_LEVEL', value: 'debug' },
      ]),
    ).toBeNull();
  });

  it('returns error when duplicate non-empty names exist', () => {
    expect(
      validateEnvVarEntries([
        { name: 'BROKER_LOG_LEVEL', value: 'debug' },
        { name: 'BROKER_LOG_LEVEL', value: 'info' },
      ]),
    ).toBe('Duplicate environment variable name "BROKER_LOG_LEVEL"');
  });
});

describe('validateYamlDuplicateBrokerServiceLabels', () => {
  it('returns null when metadata.labels has unique keys', () => {
    const yaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: my-service
  labels:
    app: messaging
    forWorkQueue: "true"
spec:
  resources:
    limits:
      memory: 2Gi
`;

    expect(validateYamlDuplicateBrokerServiceLabels(yaml)).toBeNull();
  });

  it('returns error when metadata.labels has duplicate keys', () => {
    const yaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: my-service
  labels:
    key1: one
    key1: two
spec:
  resources:
    limits:
      memory: 2Gi
`;

    expect(validateYamlDuplicateBrokerServiceLabels(yaml)).toBe(
      'Duplicate label key "key1" in metadata.labels',
    );
  });
});

describe('validateYamlDuplicateBrokerAppMatchLabels', () => {
  it('returns null when spec.selector.matchLabels has unique keys', () => {
    const yaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerApp
metadata:
  name: my-app
spec:
  selector:
    matchLabels:
      env: dev
      tier: web
`;

    expect(validateYamlDuplicateBrokerAppMatchLabels(yaml)).toBeNull();
  });

  it('returns error when spec.selector.matchLabels has duplicate keys', () => {
    const yaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerApp
metadata:
  name: my-app
spec:
  selector:
    matchLabels:
      env: dev
      env: prod
`;

    expect(validateYamlDuplicateBrokerAppMatchLabels(yaml)).toBe(
      'Duplicate label key "env" in spec.selector.matchLabels',
    );
  });
});

describe('validateCpuQuantity', () => {
  it('returns null for an empty string (field is optional)', () => {
    expect(validateCpuQuantity('')).toBeNull();
  });

  it('returns null for a plain integer (1)', () => {
    expect(validateCpuQuantity('1')).toBeNull();
  });

  it('returns null for milli-CPU (500m)', () => {
    expect(validateCpuQuantity('500m')).toBeNull();
  });

  it('returns null for a decimal value (0.5)', () => {
    expect(validateCpuQuantity('0.5')).toBeNull();
  });

  it('returns an error for a memory suffix (2Gi) — not valid for CPU', () => {
    expect(validateCpuQuantity('2Gi')).not.toBeNull();
  });

  it('returns an error for a memory suffix (512Mi) — not valid for CPU', () => {
    expect(validateCpuQuantity('512Mi')).not.toBeNull();
  });

  it('returns an error for a plain string with no numeric part', () => {
    expect(validateCpuQuantity('abc')).not.toBeNull();
  });

  it('returns an error for a value with an invalid suffix', () => {
    expect(validateCpuQuantity('500x')).not.toBeNull();
  });

  it('returns an error for a negative value', () => {
    expect(validateCpuQuantity('-500m')).not.toBeNull();
  });

  it('returns an error message with CPU-specific example formats', () => {
    expect(validateCpuQuantity('bad!')).toBe(
      'Invalid CPU quantity. Use standard format (e.g., 250m, 1, 0.5)',
    );
  });
});

describe('validateMemoryQuantity', () => {
  it('returns null for an empty string (field is optional)', () => {
    expect(validateMemoryQuantity('')).toBeNull();
  });

  it('returns null for a plain integer', () => {
    expect(validateMemoryQuantity('1')).toBeNull();
  });

  it('returns null for binary suffix (2Gi)', () => {
    expect(validateMemoryQuantity('2Gi')).toBeNull();
  });

  it('returns null for binary suffix (512Mi)', () => {
    expect(validateMemoryQuantity('512Mi')).toBeNull();
  });

  it('returns null for decimal SI suffix (1k)', () => {
    expect(validateMemoryQuantity('1k')).toBeNull();
  });

  it('returns null for decimal SI suffix (4G)', () => {
    expect(validateMemoryQuantity('4G')).toBeNull();
  });

  it('returns an error for milli-CPU suffix (500m) — not valid for memory', () => {
    expect(validateMemoryQuantity('500m')).not.toBeNull();
  });

  it('returns an error for a plain string with no numeric part', () => {
    expect(validateMemoryQuantity('abc')).not.toBeNull();
  });

  it('returns an error for a value with an invalid suffix', () => {
    expect(validateMemoryQuantity('500x')).not.toBeNull();
  });

  it('returns an error for a negative value', () => {
    expect(validateMemoryQuantity('-512Mi')).not.toBeNull();
  });

  it('returns an error message with memory-specific example formats', () => {
    expect(validateMemoryQuantity('bad!')).toBe(
      'Invalid memory quantity. Use standard format (e.g., 256Mi, 2Gi, 512M)',
    );
  });
});

describe('validateYamlDuplicateKeysInMapping', () => {
  it('returns null when duplicate keys exist outside the scanned mapping', () => {
    const yaml = `
apiVersion: broker.arkmq.org/v1beta2
kind: BrokerService
metadata:
  name: my-service
spec:
  resources:
    limits:
      memory: 2Gi
      memory: 4Gi
`;

    expect(validateYamlDuplicateBrokerServiceLabels(yaml)).toBeNull();
  });
});

describe('validateAddressEntries', () => {
  it.each<[{ address: string }[], (string | undefined)[]]>([
    [
      [{ address: 'orders.private' }, { address: 'events.topic' }],
      [undefined, undefined],
    ],
    [[{ address: '' }], ['Address is required']],
    [[{ address: '   ' }], ['Address is required']],
    [
      [{ address: 'valid.address' }, { address: '' }],
      [undefined, 'Address is required'],
    ],
    [[], []],
  ])('validates entries %j', (entries, expected) => {
    expect(validateAddressEntries(entries)).toEqual(expected);
  });
});

describe('validateDuplicateAddressEntries', () => {
  it('returns all undefined when addresses are unique', () => {
    expect(
      validateDuplicateAddressEntries([{ address: 'a' }, { address: 'b' }, { address: 'c' }]),
    ).toEqual([undefined, undefined, undefined]);
  });

  it('flags all occurrences of a duplicated address', () => {
    expect(validateDuplicateAddressEntries([{ address: 'orders' }, { address: 'orders' }])).toEqual(
      ['Duplicate address', 'Duplicate address'],
    );
  });

  it('flags every occurrence when three entries share a name', () => {
    expect(
      validateDuplicateAddressEntries([{ address: 'a' }, { address: 'a' }, { address: 'a' }]),
    ).toEqual(['Duplicate address', 'Duplicate address', 'Duplicate address']);
  });

  it('skips blank entries', () => {
    expect(validateDuplicateAddressEntries([{ address: '' }, { address: '' }])).toEqual([
      undefined,
      undefined,
    ]);
  });

  it('detects duplicates that differ only by surrounding whitespace', () => {
    expect(
      validateDuplicateAddressEntries([{ address: 'orders' }, { address: '  orders  ' }]),
    ).toEqual(['Duplicate address', 'Duplicate address']);
  });

  it('returns empty array for empty input', () => {
    expect(validateDuplicateAddressEntries([])).toEqual([]);
  });
});

describe('validateNoDuplicateAddresses', () => {
  it.each([
    [[{ address: 'orders.private' }, { address: 'events.topic' }]],
    [[]],
    [[{ address: '' }, { address: '   ' }]],
  ])('returns null for non-duplicate entries %j', (entries) => {
    expect(validateNoDuplicateAddresses(entries)).toBeNull();
  });

  it('returns error naming the first duplicate address', () => {
    expect(
      validateNoDuplicateAddresses([
        { address: 'orders' },
        { address: 'events' },
        { address: 'orders' },
      ]),
    ).toBe('Duplicate address "orders"');
  });

  it('detects duplicates that differ only by surrounding whitespace', () => {
    expect(validateNoDuplicateAddresses([{ address: 'orders' }, { address: '  orders  ' }])).toBe(
      'Duplicate address "orders"',
    );
  });

  it('returns the first duplicate when multiple duplicates exist', () => {
    expect(
      validateNoDuplicateAddresses([
        { address: 'a' },
        { address: 'b' },
        { address: 'a' },
        { address: 'b' },
      ]),
    ).toBe('Duplicate address "a"');
  });
});

describe('validateNoAddressOverlap', () => {
  it.each<[string[], string[]]>([
    [['orders.private'], ['shared.topic']],
    [[], ['shared.topic']],
    [['orders.private'], []],
    [[], []],
  ])('returns null for non-overlapping lists %j / %j', (priv, shared) => {
    expect(validateNoAddressOverlap(priv, shared)).toBeNull();
  });

  it('returns an error naming the overlapping address', () => {
    expect(validateNoAddressOverlap(['chungus', 'other'], ['chungus'])).toBe(
      'Address "chungus" cannot appear in both spec.addresses and spec.sharedAddresses',
    );
  });

  it('returns the first overlapping address when multiple overlap', () => {
    expect(validateNoAddressOverlap(['a', 'b', 'c'], ['b', 'c'])).toBe(
      'Address "b" cannot appear in both spec.addresses and spec.sharedAddresses',
    );
  });

  it('detects overlap when addresses differ only by surrounding whitespace', () => {
    expect(validateNoAddressOverlap(['  orders  '], ['orders'])).toBe(
      'Address "orders" cannot appear in both spec.addresses and spec.sharedAddresses',
    );
  });

  it('ignores empty/whitespace-only entries when checking overlap', () => {
    expect(validateNoAddressOverlap(['', '   '], ['', '   '])).toBeNull();
  });
});

const validBrokerAppCR: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'my-app', namespace: 'test-ns' },
  spec: {},
};

const dumpYaml = (cr: object): string => jsYaml.dump(cr);

describe('validateBrokerAppCR', () => {
  it('returns null for a valid minimal CR', () => {
    expect(validateBrokerAppCR(validBrokerAppCR, dumpYaml(validBrokerAppCR))).toBeNull();
  });

  it('returns null for a valid CR without yaml argument', () => {
    expect(validateBrokerAppCR(validBrokerAppCR)).toBeNull();
  });

  it('returns errors without line numbers when yaml is omitted', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      metadata: { name: 'INVALID', namespace: 'test-ns' },
    };
    const error = validateBrokerAppCR(cr);
    expect(error).toContain('metadata.name:');
    expect(error).not.toContain('Line');
  });

  it('returns null for a valid CR with resources and addresses', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: {
        resources: {
          requests: { cpu: '250m', memory: '256Mi' },
          limits: { cpu: '1', memory: '1Gi' },
        },
        addresses: [{ address: 'orders' }],
        sharedAddresses: [{ address: 'events' }],
      },
    };
    expect(validateBrokerAppCR(cr, dumpYaml(cr))).toBeNull();
  });

  it('rejects a name with uppercase letters (DNS-1123 violation)', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      metadata: { name: 'My-App', namespace: 'test-ns' },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('metadata.name:');
  });

  it('rejects an empty metadata.name', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      metadata: { name: '', namespace: 'test-ns' },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('metadata.name: Name is required');
  });

  it('rejects a memory suffix in a CPU request field', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { resources: { requests: { cpu: '2Gi' } } },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.resources.requests.cpu:');
  });

  it('rejects a non-numeric CPU limit', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { resources: { limits: { cpu: 'abc' } } },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.resources.limits.cpu:');
  });

  it('rejects a non-numeric memory request', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { resources: { requests: { memory: 'bad' } } },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.resources.requests.memory:');
  });

  it('rejects a CPU suffix in a memory limit field', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { resources: { limits: { memory: '500m' } } },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.resources.limits.memory:');
  });

  it('rejects an empty address name in spec.addresses', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { addresses: [{ address: '' }] },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.addresses[0].address: Address is required');
  });

  it('rejects duplicate addresses in spec.addresses', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { addresses: [{ address: 'orders' }, { address: 'orders' }] },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.addresses: Duplicate address "orders"');
  });

  it('rejects duplicate addresses in spec.sharedAddresses', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: { sharedAddresses: [{ address: 'events' }, { address: 'events' }] },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.sharedAddresses: Duplicate address "events"');
  });

  it('rejects overlapping addresses between spec.addresses and spec.sharedAddresses', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      spec: {
        addresses: [{ address: 'overlap' }],
        sharedAddresses: [{ address: 'overlap' }],
      },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    expect(error).toContain(
      'Address "overlap" cannot appear in both spec.addresses and spec.sharedAddresses',
    );
  });

  it('collects multiple errors separated by newlines', () => {
    const cr: BrokerAppCR = {
      ...validBrokerAppCR,
      metadata: { name: '', namespace: 'test-ns' },
      spec: {
        resources: { requests: { cpu: 'bad' } },
        addresses: [{ address: 'dup' }, { address: 'dup' }],
      },
    };
    const error = validateBrokerAppCR(cr, dumpYaml(cr));
    if (error === null) {
      throw new Error('Expected validation error but got null');
    }
    const lines = error.split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines[0]).toContain('metadata.name:');
    expect(lines[1]).toContain('spec.resources.requests.cpu:');
    expect(lines[2]).toContain('spec.addresses:');
  });

  it('includes line numbers from the YAML source', () => {
    const yaml = [
      'apiVersion: broker.arkmq.org/v1beta2',
      'kind: BrokerApp',
      'metadata:',
      '  name: My-App',
      '  namespace: test-ns',
      'spec:',
      '  resources:',
      '    requests:',
      '      cpu: 2Gi',
    ].join('\n');
    const cr = jsYaml.load(yaml) as BrokerAppCR;
    const error = validateBrokerAppCR(cr, yaml);
    expect(error).toContain('Line 4: metadata.name:');
    expect(error).toContain('Line 9: spec.resources.requests.cpu:');
  });
});

const validBrokerServiceCR: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-service', namespace: 'test-ns' },
  spec: { resources: { limits: { memory: '2Gi' } } },
};

describe('validateBrokerServiceCR', () => {
  it('returns null for a valid CR', () => {
    expect(
      validateBrokerServiceCR(validBrokerServiceCR, dumpYaml(validBrokerServiceCR)),
    ).toBeNull();
  });

  it('returns null when memory is absent', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: {},
    };
    expect(validateBrokerServiceCR(cr, dumpYaml(cr))).toBeNull();
  });

  it('returns null for memory with Mi unit', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: { resources: { limits: { memory: '512Mi' } } },
    };
    expect(validateBrokerServiceCR(cr, dumpYaml(cr))).toBeNull();
  });

  it('rejects a name with uppercase letters (DNS-1123 violation)', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      metadata: { name: 'My-Service', namespace: 'test-ns' },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain('metadata.name:');
  });

  it('rejects memory with unsupported unit', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: { resources: { limits: { memory: '2Ti' } } },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain("spec.resources.limits.memory: invalid format '2Ti'");
  });

  it('rejects memory with completely invalid format', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: { resources: { limits: { memory: 'abc' } } },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain("spec.resources.limits.memory: invalid format 'abc'");
  });

  it('rejects memory with CPU suffix', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: { resources: { limits: { memory: '500m' } } },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain("spec.resources.limits.memory: invalid format '500m'");
  });

  it('rejects zero memory value', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: { resources: { limits: { memory: '0Gi' } } },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.resources.limits.memory: Memory value must be greater than 0');
  });

  it('collects multiple errors separated by newlines', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      metadata: { name: '', namespace: 'test-ns' },
      spec: { resources: { limits: { memory: 'bad' } } },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    if (error === null) {
      throw new Error('Expected validation error but got null');
    }
    const lines = error.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('metadata.name:');
    expect(lines[1]).toContain('spec.resources.limits.memory:');
  });

  it('includes line numbers from the YAML source', () => {
    const yaml = [
      'apiVersion: broker.arkmq.org/v1beta2',
      'kind: BrokerService',
      'metadata:',
      '  name: My-Service',
      '  namespace: test-ns',
      'spec:',
      '  resources:',
      '    limits:',
      '      memory: abc',
    ].join('\n');
    const cr = jsYaml.load(yaml) as BrokerService;
    const error = validateBrokerServiceCR(cr, yaml);
    expect(error).toContain('Line 4: metadata.name:');
    expect(error).toContain('Line 9: spec.resources.limits.memory:');
  });

  it('returns null when spec.env has unique names', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: {
        resources: { limits: { memory: '2Gi' } },
        env: [{ name: 'BROKER_MAX_CONNECTIONS', value: '1000' }],
      },
    };
    expect(validateBrokerServiceCR(cr, dumpYaml(cr))).toBeNull();
  });

  it('rejects spec.env entries with duplicate names', () => {
    const cr: BrokerService = {
      ...validBrokerServiceCR,
      spec: {
        resources: { limits: { memory: '2Gi' } },
        env: [
          { name: 'BROKER_LOG_LEVEL', value: 'debug' },
          { name: 'BROKER_LOG_LEVEL', value: 'info' },
        ],
      },
    };
    const error = validateBrokerServiceCR(cr, dumpYaml(cr));
    expect(error).toContain('spec.env: Duplicate environment variable name "BROKER_LOG_LEVEL"');
  });
});
