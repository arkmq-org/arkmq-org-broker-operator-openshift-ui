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
