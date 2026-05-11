export const validateDNS1123 = (value: string): string | null => {
  if (!value) return 'Name is required';
  if (value.length > 253) return 'Name must be 253 characters or fewer';
  const dns1123Regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
  if (!dns1123Regex.test(value)) {
    return 'Name must be lowercase alphanumeric characters or "-", and must start and end with an alphanumeric character';
  }
  return null;
};
