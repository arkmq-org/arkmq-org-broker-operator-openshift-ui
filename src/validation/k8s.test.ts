import {
  validateDNS1123,
  validateLabelEntries,
  validateMemoryValue,
  validateCpuQuantity,
  validateMemoryQuantity,
  validateYamlDuplicateBrokerServiceLabels,
  validateYamlDuplicateBrokerAppMatchLabels,
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
