export const validateDNS1123 = (value: string): string | null => {
  if (!value) return 'Name is required';
  if (value.length > 253) return 'Name must be 253 characters or fewer';
  const dns1123Regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
  if (!dns1123Regex.test(value)) {
    return 'Name must be lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character';
  }
  return null;
};

// Rejects duplicate non-empty label keys in form label rows.
export const validateLabelEntries = (entries: { key: string; value: string }[]): string | null => {
  const seen = new Set<string>();
  for (const { key } of entries) {
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      return `Duplicate label key "${key}"`;
    }
    seen.add(key);
  }
  return null;
};

// Strips surrounding quotes from a YAML mapping key.
const unquoteYamlKey = (key: string): string => {
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    return key.slice(1, -1);
  }
  return key;
};

// Scans raw YAML for duplicate keys in a nested mapping; parsed YAML cannot detect them.
export const validateYamlDuplicateKeysInMapping = (
  yamlContent: string,
  mappingPath: readonly string[],
  mappingDisplayName: string,
): string | null => {
  const lines = yamlContent.split(/\r?\n/);
  let segmentIndents: number[] = [];
  let segmentIndex = 0;
  let mappingIndent: number | null = null;
  let entryIndent: number | null = null;
  const seenKeys = new Set<string>();

  const resetMapping = (): void => {
    mappingIndent = null;
    entryIndent = null;
    seenKeys.clear();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indent = line.length - trimmed.length;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }

    const key = unquoteYamlKey(trimmed.slice(0, colonIdx).trim());

    if (segmentIndex < mappingPath.length && key === mappingPath[segmentIndex]) {
      const parentIndent = segmentIndex === 0 ? -1 : segmentIndents[segmentIndex - 1];
      if (segmentIndex === 0 || indent > parentIndent) {
        segmentIndents[segmentIndex] = indent;
        segmentIndex++;
        if (segmentIndex === mappingPath.length) {
          mappingIndent = indent;
          entryIndent = null;
          seenKeys.clear();
        }
        continue;
      }
    }

    if (segmentIndex > 0 && segmentIndex < mappingPath.length) {
      const parentIndent = segmentIndents[segmentIndex - 1];
      if (indent <= parentIndent) {
        segmentIndex = 0;
        segmentIndents = [];
        resetMapping();
      }
    }

    if (mappingIndent !== null) {
      if (indent <= mappingIndent) {
        segmentIndex = 0;
        segmentIndents = [];
        resetMapping();
        continue;
      }

      entryIndent ??= indent;

      if (indent === entryIndent) {
        if (seenKeys.has(key)) {
          return `Duplicate label key "${key}" in ${mappingDisplayName}`;
        }
        seenKeys.add(key);
      }
    }
  }

  return null;
};

/**
 * Per-entry required check — flags empty or whitespace-only address names.
 *
 * @param entries - Any array of objects with an address field
 * @returns Parallel array of error strings or undefined
 */
export const validateAddressEntries = (entries: { address: string }[]): (string | undefined)[] =>
  entries.map((e) => (e.address.trim() ? undefined : 'Address is required'));

/**
 * Marks the second and subsequent occurrences of duplicate non-empty addresses.
 * The first occurrence is not flagged — only later repeats get an error.
 * Blank entries are skipped (handled by validateAddressEntries).
 *
 * @param entries - Any array of objects with an address field
 * @returns Per-entry error or undefined, parallel to the input array
 */
export const validateDuplicateAddressEntries = (
  entries: { address: string }[],
): (string | undefined)[] => {
  const seen = new Set<string>();
  return entries.map((e) => {
    const trimmed = e.address.trim();
    if (!trimmed) return undefined;
    if (seen.has(trimmed)) return 'Duplicate address';
    seen.add(trimmed);
    return undefined;
  });
};

/**
 * Rejects duplicate non-empty address names within a single address list.
 * Empty/whitespace entries are skipped — validateAddressEntries handles those.
 *
 * @param entries - Any array of objects with an address field
 * @returns Error naming the first duplicate, or null when all entries are unique
 */
export const validateNoDuplicateAddresses = (entries: { address: string }[]): string | null => {
  const seen = new Set<string>();
  for (const { address } of entries) {
    const trimmed = address.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) {
      return `Duplicate address "${trimmed}"`;
    }
    seen.add(trimmed);
  }
  return null;
};

// TODO: i18n — this returns an interpolated English string; callers throw it as an Error
// so it bypasses t(). To translate, return the overlap address separately and let the call site
// build the message with t() interpolation.
// Ensures no address is in both spec.addresses and spec.sharedAddresses; if so returns error naming first overlapping address, else null.
export const validateNoAddressOverlap = (
  privateAddresses: string[],
  sharedAddresses: string[],
): string | null => {
  const sharedSet = new Set(sharedAddresses.map((a) => a.trim()));
  const overlap = privateAddresses.map((a) => a.trim()).find((a) => a && sharedSet.has(a));

  return overlap
    ? `Address "${overlap}" cannot appear in both spec.addresses and spec.sharedAddresses`
    : null;
};

export const validateYamlDuplicateBrokerServiceLabels = (yamlContent: string): string | null =>
  validateYamlDuplicateKeysInMapping(yamlContent, ['metadata', 'labels'], 'metadata.labels');

export const validateYamlDuplicateBrokerAppMatchLabels = (yamlContent: string): string | null =>
  validateYamlDuplicateKeysInMapping(
    yamlContent,
    ['spec', 'selector', 'matchLabels'],
    'spec.selector.matchLabels',
  );

/**
 * Validate memory value (must be a positive number)
 */
export const validateMemoryValue = (value: string): string | null => {
  if (!value) {
    return 'Memory value is required';
  }

  const numValue = parseFloat(value);

  if (isNaN(numValue)) {
    return 'Memory value must be a number';
  }

  if (numValue <= 0) {
    return 'Memory value must be greater than 0';
  }

  return null;
};
