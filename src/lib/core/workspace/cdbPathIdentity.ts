const WINDOWS_EXTENDED_UNC_PREFIX = '//?/unc/';
const WINDOWS_EXTENDED_PREFIX = '//?/';

export const getCdbPathIdentity = (path: string): string => {
  let normalized = path.trim().replaceAll('\\', '/');
  const lower = normalized.toLocaleLowerCase('en-US');

  if (lower.startsWith(WINDOWS_EXTENDED_UNC_PREFIX)) {
    normalized = `//${normalized.slice(WINDOWS_EXTENDED_UNC_PREFIX.length)}`;
  } else if (lower.startsWith(WINDOWS_EXTENDED_PREFIX)) {
    normalized = normalized.slice(WINDOWS_EXTENDED_PREFIX.length);
  }

  const isWindowsPath = /^[a-z]:\//i.test(normalized) || normalized.startsWith('//');
  const withoutTrailingSeparators = normalized.length > 1
    ? normalized.replace(/\/+$/, '')
    : normalized;

  return isWindowsPath
    ? withoutTrailingSeparators.toLocaleLowerCase('en-US')
    : withoutTrailingSeparators;
};
