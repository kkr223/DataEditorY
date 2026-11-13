const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;
const UNC_PREFIX = /^[\\/]{2}[^\\/]/;

/** Returns the dominant separator of a path; defaults to `/`. */
export function detectSeparator(path: string): '\\' | '/' {
  const forward = path.indexOf('/');
  const backward = path.indexOf('\\');
  if (backward >= 0 && (forward < 0 || backward < forward)) return '\\';
  return '/';
}

export function isAbsolutePath(path: string): boolean {
  return WINDOWS_DRIVE_PREFIX.test(path) || UNC_PREFIX.test(path) || path.startsWith('/');
}

function stripTrailingSeparators(path: string): string {
  if (path.length <= 1) return path;
  const stripped = path.replace(/[\\/]+$/, '');
  return stripped || path.slice(0, 1);
}

/** Last path segment. Returns an empty string for a filesystem root. */
export function basename(path: string): string {
  const trimmed = stripTrailingSeparators(path.trim());
  if (!trimmed || /^[a-zA-Z]:$/.test(trimmed)) return '';
  const separator = detectSeparator(trimmed);
  const index = trimmed.lastIndexOf(separator);
  const name = index >= 0 ? trimmed.slice(index + 1) : trimmed;
  // `C:\` and `C:` have no useful basename.
  return WINDOWS_DRIVE_PREFIX.test(trimmed) && !name ? '' : name;
}

/** Removes the last segment. Relative single segments resolve to `.`. */
export function dirname(path: string): string {
  const trimmed = stripTrailingSeparators(path.trim());
  if (!trimmed) return '.';
  const separator = detectSeparator(trimmed);
  const index = trimmed.lastIndexOf(separator);
  if (index < 0) return '.';
  if (index === 0) return separator;
  const head = trimmed.slice(0, index);
  if (WINDOWS_DRIVE_PREFIX.test(trimmed) && head.length === 2) {
    return `${head}${separator}`;
  }
  return stripTrailingSeparators(head) || separator;
}

/** Splits a `scheme://` prefix so joins never collapse it. */
function splitScheme(path: string): { scheme: string; rest: string } {
  const match = /^([a-zA-Z][\w+.-]*:\/\/)(.*)$/.exec(path);
  return match ? { scheme: match[1], rest: match[2] } : { scheme: '', rest: path };
}

/** Joins path segments without touching the filesystem or IPC. */
export function join(...parts: Array<string | null | undefined>): string {
  const segments = parts.filter((part): part is string => Boolean(part && part.trim()));
  if (segments.length === 0) return '';
  const first = segments[0].trim();
  const separator = detectSeparator(first);
  const { scheme, rest: firstRest } = splitScheme(first);
  const absolute = isAbsolutePath(first);
  const normalized: string[] = [];

  for (const [index, rawPart] of segments.entries()) {
    let part = rawPart.trim().replace(/[\\/]+/g, separator);
    if (index === 0) {
      part = stripTrailingSeparators(scheme ? firstRest : part);
      if (part) normalized.push(part);
      continue;
    }
    part = part.replace(new RegExp(`^\\${separator}+`), '');
    part = stripTrailingSeparators(part);
    if (part) normalized.push(part);
  }

  if (normalized.length === 0) return scheme || (absolute ? separator : '');
  const joined = `${scheme}${normalized.join(separator)}`;
  if (absolute && !scheme && !isAbsolutePath(joined)) return `${separator}${joined}`;
  return joined;
}

/** Extension including the leading dot, or an empty string. */
export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index) : '';
}

/** File name without its extension. */
export function fileStem(path: string): string {
  const name = basename(path);
  const extension = extname(name);
  return extension ? name.slice(0, -extension.length) : name;
}

/** Replaces all separators with `/` for cross-platform comparisons. */
export function toForwardSlashes(path: string): string {
  return path.replaceAll('\\', '/');
}
