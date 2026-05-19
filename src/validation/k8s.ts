/**
 * DNS-1123 subdomain validation
 * Must consist of lower case alphanumeric characters, '-' or '.',
 * and must start and end with an alphanumeric character
 */
export const validateDNS1123 = (value: string): string | null => {
  if (!value) {
    return 'Name is required';
  }

  const dns1123Regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

  if (value.length > 253) {
    return 'Name must be no more than 253 characters';
  }

  if (!dns1123Regex.test(value)) {
    return 'Name must consist of lower case alphanumeric characters, "-" or ".", and must start and end with an alphanumeric character';
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
