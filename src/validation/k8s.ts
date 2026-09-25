import { type Document, parseDocument } from 'yaml';
import type { BrokerAppCR, BrokerAppSpec, BrokerService } from '../k8s/types';

/** Matches a memory string the BrokerService form can represent: `<number>Mi` or `<number>Gi`. */
export const FORM_MEMORY_REGEX = /^(\d+(?:\.\d+)?)(Mi|Gi)$/;

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

// Per-entry required check — flags empty or whitespace-only address names.
export const validateAddressEntries = (entries: { address: string }[]): (string | undefined)[] =>
  entries.map((e) => (e.address.trim() ? undefined : 'Address is required'));

/**
 * Marks all occurrences of a duplicated non-empty address.
 * Blank entries are skipped (handled by validateAddressEntries).
 */
export const validateDuplicateAddressEntries = (
  entries: { address: string }[],
): (string | undefined)[] => {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const trimmed = e.address.trim();
    if (trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }
  return entries.map((e) => {
    const trimmed = e.address.trim();
    if (!trimmed) return undefined;
    return (counts.get(trimmed) ?? 0) > 1 ? 'Duplicate address' : undefined;
  });
};

//  Rejects duplicate non-empty address names within a single address list.
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
 * Validates a CPU quantity value.
 * Accepts: plain integer (1), decimal (0.5), or milli-CPU (500m).
 * Rejects memory-only suffixes such as Ki, Mi, Gi.
 */
export const validateCpuQuantity = (value: string): string | null => {
  if (!value) return null;
  const cpuRegex = /^(\d+(\.\d+)?|\.\d+)(m)?$/;
  if (!cpuRegex.test(value)) {
    return 'Invalid CPU quantity. Use standard format (e.g., 250m, 1, 0.5)';
  }
  return null;
};

/**
 * Validates a memory quantity value.
 * Accepts: binary suffixes (Ki, Mi, Gi, Ti, Pi, Ei), decimal-SI suffixes (k, M, G, T, P, E),
 * or plain integers. Rejects CPU-only suffix m.
 */
export const validateMemoryQuantity = (value: string): string | null => {
  if (!value) return null;
  const memoryRegex = /^(\d+(\.\d+)?|\.\d+)(k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei)?$/;
  if (!memoryRegex.test(value)) {
    return 'Invalid memory quantity. Use standard format (e.g., 256Mi, 2Gi, 512M)';
  }
  return null;
};

/**
 * Basic client-side validation for CEL app selector expressions.
 * Empty expressions are valid (operator falls back to same-namespace-only default).
 * Checks balanced parentheses/brackets and rejects characters illegal in CEL.
 *
 * @param expression - Raw CEL expression string from the form field
 * @returns Error message string, or null when the expression is structurally valid
 */
export const validateCelExpression = (expression: string): string | null => {
  if (!expression.trim()) return null;

  const stack: string[] = [];
  const matchingClose: Record<string, string> = { '(': ')', '[': ']' };
  const matchingOpen: Record<string, string> = { ')': '(', ']': '[' };

  for (const ch of expression) {
    if (ch in matchingClose) {
      stack.push(ch);
    } else if (ch in matchingOpen) {
      if (stack.length === 0 || stack[stack.length - 1] !== matchingOpen[ch]) {
        return `Unmatched "${ch}" in expression`;
      }
      stack.pop();
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    return `Unmatched "${unclosed}" in expression`;
  }

  for (const ch of [';', '{', '}']) {
    if (expression.includes(ch)) {
      return `Character "${ch}" is not valid in a CEL expression`;
    }
  }

  return null;
};

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

/**
 * Finds the 1-based line number in a pre-parsed YAML document for a dotted field path.
 * For array-indexed paths like "spec.addresses[0].address", locates the indexed element.
 */
const findYamlLineForPath = (doc: Document, yaml: string, fieldPath: string): number | null => {
  const pathSegments: (string | number)[] = [];
  for (const part of fieldPath.split('.')) {
    const m = /^(.+)\[(\d+)\]$/.exec(part);
    if (m) {
      pathSegments.push(m[1], parseInt(m[2], 10));
    } else {
      pathSegments.push(part);
    }
  }

  const node = doc.getIn(pathSegments, true);
  if (!node || typeof node !== 'object' || !('range' in node)) return null;

  const range = (node as { range?: [number, number, number] }).range;
  if (!range) return null;

  return yaml.slice(0, range[0]).split('\n').length;
};

/**
 * Creates a field-error formatter that parses the YAML document once and reuses it
 * across all error messages for a single validation pass.
 */
const createFieldErrorFormatter = (yaml?: string) => {
  const doc = yaml ? parseDocument(yaml) : undefined;
  return (path: string, message: string): string => {
    if (doc && yaml) {
      const line = findYamlLineForPath(doc, yaml, path);
      if (line !== null) return `Line ${String(line)}: ${path}: ${message}`;
    }
    return `${path}: ${message}`;
  };
};

/**
 * Validates all managed BrokerApp fields before accepting a YAML-parsed CR into form state.
 * Prevents invalid values (malformed names, bad CPU/memory quantities, duplicate or overlapping
 * addresses) from bypassing form-level validation when switching from YAML to Form view.
 *
 * @param cr - Parsed BrokerApp CR from YAML or live form state
 * @param yaml - Raw YAML text for line numbers in error messages; omit for form-only validation
 * @returns Newline-separated error messages with field paths (and line numbers when yaml is provided), or null when valid
 */
export const validateBrokerAppCR = (cr: BrokerAppCR, yaml?: string): string | null => {
  const errors: string[] = [];
  const fmt = createFieldErrorFormatter(yaml);
  // YAML-parsed CRs are unsafely cast — spec may be absent at runtime
  const spec = cr.spec as BrokerAppSpec | undefined;

  const nameError = validateDNS1123(cr.metadata?.name ?? '');
  if (nameError) errors.push(fmt('metadata.name', nameError));

  const cpuReq = spec?.resources?.requests?.cpu;
  if (cpuReq) {
    const err = validateCpuQuantity(cpuReq);
    if (err) errors.push(fmt('spec.resources.requests.cpu', err));
  }

  const cpuLim = spec?.resources?.limits?.cpu;
  if (cpuLim) {
    const err = validateCpuQuantity(cpuLim);
    if (err) errors.push(fmt('spec.resources.limits.cpu', err));
  }

  const memReq = spec?.resources?.requests?.memory;
  if (memReq) {
    const err = validateMemoryQuantity(memReq);
    if (err) errors.push(fmt('spec.resources.requests.memory', err));
  }

  const memLim = spec?.resources?.limits?.memory;
  if (memLim) {
    const err = validateMemoryQuantity(memLim);
    if (err) errors.push(fmt('spec.resources.limits.memory', err));
  }

  const privateAddrs = spec?.addresses ?? [];
  privateAddrs.forEach((a, i) => {
    if (!a.address.trim()) {
      errors.push(fmt(`spec.addresses[${String(i)}].address`, 'Address is required'));
    }
  });
  const privateDup = validateNoDuplicateAddresses(privateAddrs);
  if (privateDup) errors.push(fmt('spec.addresses', privateDup));

  const sharedAddrs = spec?.sharedAddresses ?? [];
  sharedAddrs.forEach((a, i) => {
    if (!a.address.trim()) {
      errors.push(fmt(`spec.sharedAddresses[${String(i)}].address`, 'Address is required'));
    }
  });
  const sharedDup = validateNoDuplicateAddresses(sharedAddrs);
  if (sharedDup) errors.push(fmt('spec.sharedAddresses', sharedDup));

  const overlapError = validateNoAddressOverlap(
    privateAddrs.map((a) => a.address),
    sharedAddrs.map((a) => a.address),
  );
  if (overlapError) errors.push(fmt('spec.addresses', overlapError));

  return errors.length ? errors.join('\n') : null;
};

/**
 * Validates all managed BrokerService fields before accepting a YAML-parsed CR into form state.
 * The form decomposes memory into a numeric value and a unit (Mi or Gi); values with other
 * formats would be silently converted to defaults, so they are rejected here.
 *
 * @param cr - Parsed BrokerService CR from YAML or live form state
 * @param yaml - Raw YAML text for line numbers in error messages; omit for form-only validation
 * @returns Newline-separated error messages with field paths (and line numbers when yaml is provided), or null when valid
 */
export const validateBrokerServiceCR = (cr: BrokerService, yaml?: string): string | null => {
  const errors: string[] = [];
  const fmt = createFieldErrorFormatter(yaml);

  const nameError = validateDNS1123(cr.metadata?.name ?? '');
  if (nameError) errors.push(fmt('metadata.name', nameError));

  const memoryStr = cr.spec?.resources?.limits?.memory;
  if (memoryStr !== undefined) {
    const memMatch = FORM_MEMORY_REGEX.exec(memoryStr);
    if (!memMatch) {
      errors.push(
        fmt(
          'spec.resources.limits.memory',
          `invalid format '${memoryStr}', expected <number>Mi or <number>Gi (e.g., 256Mi, 2Gi)`,
        ),
      );
    } else {
      const numError = validateMemoryValue(memMatch[1]);
      if (numError) errors.push(fmt('spec.resources.limits.memory', numError));
    }
  }

  const celExpr = cr.spec?.appSelectorExpression;
  if (celExpr) {
    const celError = validateCelExpression(celExpr);
    if (celError) errors.push(fmt('spec.appSelectorExpression', celError));
  }

  return errors.length ? errors.join('\n') : null;
};
