const normalizePath = (value: string) => value.trim().replaceAll('\\', '/').toLowerCase();

export const normalizeFilePattern = (pattern: string) => {
  const normalized = normalizePath(pattern);
  if (!normalized) {
    throw new Error('Codec file pattern cannot be empty');
  }
  if (!normalized.startsWith('.') && !normalized.startsWith('*')) {
    throw new Error(`Unsupported codec file pattern: ${pattern}`);
  }
  return normalized;
};

export const matchesFilePattern = (source: string, pattern: string) => {
  const normalizedSource = normalizePath(source);
  const normalizedPattern = normalizeFilePattern(pattern);
  if (normalizedPattern.startsWith('*.')) {
    return normalizedSource.endsWith(normalizedPattern.slice(1));
  }
  if (normalizedPattern.startsWith('*')) {
    return normalizedSource.endsWith(normalizedPattern.slice(1));
  }
  return normalizedSource.endsWith(normalizedPattern);
};
