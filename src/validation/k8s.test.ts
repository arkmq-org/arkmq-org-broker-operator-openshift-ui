import { validateDNS1123, validateMemoryValue } from './k8s';

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
