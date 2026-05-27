import { normalizeShortcutBindingMap } from '$lib/features/shortcuts/registry';
import type { SaveAppSettingsRequest } from '$lib/types/app';

export const DEFAULT_PACKAGE_INCLUDE_PATTERNS = [
  'pics/{code}.jpg',
  'pics/field/{code}.jpg',
  'script/c{code}.lua',
  'strings.conf',
  'lflist.conf',
];

const LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS = [
  'pics/{code}.jpg',
  'pics/field/{code}.jpg',
  'script/{code}.lua',
  'strings.conf',
  'lflist.conf',
];

export type SaveAppSettingsInput = {
  apiBaseUrl: string;
  model?: string;
  temperature?: number;
  scriptTemplate: string;
  useExternalScriptEditor?: boolean;
  saveScriptImageToLocal?: boolean;
  packageIncludePatterns?: string[];
  shortcutBindings?: Record<string, string>;
  secretKey?: string;
  clearSecretKey?: boolean;
};

function isSamePatternList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function normalizeSettingsTemperature(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0, Number(value)));
}

export function normalizePackageIncludePatterns(value: string[] | null | undefined) {
  const patterns = (value ?? [])
    .map((item) => String(item ?? '').trim().replace(/\\/g, '/'))
    .filter((item) => item.length > 0);
  const uniquePatterns = Array.from(new Set(patterns));
  if (uniquePatterns.length === 0 || isSamePatternList(uniquePatterns, LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS)) {
    return [...DEFAULT_PACKAGE_INCLUDE_PATTERNS];
  }
  return uniquePatterns;
}

export function buildSaveAppSettingsRequest(
  input: SaveAppSettingsInput,
  fallbackTemperature: number,
): SaveAppSettingsRequest {
  return {
    apiBaseUrl: input.apiBaseUrl,
    model: input.model ?? null,
    temperature: normalizeSettingsTemperature(input.temperature ?? fallbackTemperature),
    scriptTemplate: input.scriptTemplate,
    useExternalScriptEditor: input.useExternalScriptEditor ?? null,
    saveScriptImageToLocal: input.saveScriptImageToLocal ?? null,
    packageIncludePatterns: input.packageIncludePatterns
      ? normalizePackageIncludePatterns(input.packageIncludePatterns)
      : null,
    shortcutBindings: input.shortcutBindings
      ? normalizeShortcutBindingMap(input.shortcutBindings)
      : null,
    secretKey: input.secretKey ?? null,
    clearSecretKey: input.clearSecretKey ?? null,
  };
}
