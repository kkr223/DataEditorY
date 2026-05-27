import type { SelectOption } from '$lib/types';

// ── Helpers ───────────────────────────────────────────────────────────

function hexToNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = parseInt(v, 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseNumericOptions(raw: { value: unknown; label?: string }[]): SelectOption<number>[] {
  return raw.map((opt, i) => ({
    value: hexToNum(opt.value, i),
    label: opt.label,
  }));
}

function parseStringOptions(raw: { value: unknown; label?: string }[]): SelectOption<string>[] {
  return raw.map((opt) => ({
    value: String(opt.value ?? ''),
    label: opt.label,
  }));
}

function parseStringOptionItems(raw: { value: unknown; label?: string }[]): StringOption[] {
  return raw.map((opt) => ({
    value: String(opt.value ?? ''),
    label: opt.label,
  }));
}

function replaceArray<T>(target: T[], source: T[]): void {
  target.length = 0;
  target.push(...source);
}

type StringOption = { value: string; label?: string; labelKey?: string };

// ── Default hardcoded fallback values (Chinese) ────────────────────────

const DEFAULT_RACES: SelectOption<number>[] = [
  { value: 0, label: '无' },
  { value: 0x1, label: '战士族' },
  { value: 0x2, label: '魔法师族' },
  { value: 0x4, label: '天使族' },
  { value: 0x8, label: '恶魔族' },
  { value: 0x10, label: '不死族' },
  { value: 0x20, label: '机械族' },
  { value: 0x40, label: '水族' },
  { value: 0x80, label: '炎族' },
  { value: 0x100, label: '岩石族' },
  { value: 0x200, label: '鸟兽族' },
  { value: 0x400, label: '植物族' },
  { value: 0x800, label: '昆虫族' },
  { value: 0x1000, label: '雷族' },
  { value: 0x2000, label: '龙族' },
  { value: 0x4000, label: '兽族' },
  { value: 0x8000, label: '兽战士族' },
  { value: 0x10000, label: '恐龙族' },
  { value: 0x20000, label: '鱼族' },
  { value: 0x40000, label: '海龙族' },
  { value: 0x80000, label: '爬虫类族' },
  { value: 0x100000, label: '念动力族' },
  { value: 0x200000, label: '幻神兽族' },
  { value: 0x400000, label: '创造神族' },
  { value: 0x800000, label: '幻龙族' },
  { value: 0x1000000, label: '电子界族' },
  { value: 0x2000000, label: '幻想魔族' },
];

const DEFAULT_ATTRIBUTE_EDITOR: SelectOption<number>[] = [
  { value: 0, label: '无' },
  { value: 0x1, label: '地' },
  { value: 0x2, label: '水' },
  { value: 0x4, label: '炎' },
  { value: 0x8, label: '风' },
  { value: 0x10, label: '光' },
  { value: 0x20, label: '暗' },
  { value: 0x40, label: '神' },
];

const DEFAULT_ATTRIBUTE_FILTER: SelectOption<string>[] = [
  { value: '', label: '无' },
  { value: 'earth', label: '地' },
  { value: 'water', label: '水' },
  { value: 'fire', label: '炎' },
  { value: 'wind', label: '风' },
  { value: 'light', label: '光' },
  { value: 'dark', label: '暗' },
  { value: 'divine', label: '神' },
];

const DEFAULT_CARD_IMAGE_ATTRIBUTES: StringOption[] = [
  { value: '', label: '无' },
  { value: 'dark', label: '暗' },
  { value: 'light', label: '光' },
  { value: 'earth', label: '地' },
  { value: 'water', label: '水' },
  { value: 'fire', label: '炎' },
  { value: 'wind', label: '风' },
  { value: 'divine', label: '神' },
];

const DEFAULT_LICENSES: SelectOption<number>[] = [
  { value: 0, label: 'N/A' },
  { value: 1, label: 'OCG' },
  { value: 2, label: 'TCG' },
  { value: 3, label: 'OCG/TCG' },
  { value: 4, label: 'Custom' },
  { value: 9, label: '简体中文' },
  { value: 11, label: '简体中文/TCG' },
];

const DEFAULT_LEVEL_MIN = 1;
const DEFAULT_LEVEL_MAX = 13;

// ── Runtime state ─────────────────────────────────────────────────────

/** Race/种族 options for the card editor. */
export const RACE_OPTIONS: SelectOption<number>[] = [...DEFAULT_RACES];

/** Attribute/属性 options for the card editor (numeric bitmask values). */
export const ATTRIBUTE_OPTIONS: SelectOption<number>[] = [...DEFAULT_ATTRIBUTE_EDITOR];

/** Attribute/属性 options for the search filter (string values). */
export const ATTRIBUTE_FILTER_OPTIONS: SelectOption<string>[] = [...DEFAULT_ATTRIBUTE_FILTER];

/** Attribute/属性 options for the card image editor (string values with label). */
export const CARD_IMAGE_ATTRIBUTE_OPTIONS: StringOption[] = [...DEFAULT_CARD_IMAGE_ATTRIBUTES];

/** Permission/license/许可 options. */
export const PERMISSION_OPTIONS: SelectOption<number>[] = [...DEFAULT_LICENSES];

/** Minimum level for the level dropdown. */
export let LEVEL_MIN = DEFAULT_LEVEL_MIN;
/** Maximum level for the level dropdown. */
export let LEVEL_MAX = DEFAULT_LEVEL_MAX;

// ── Init promise cache (per locale) ───────────────────────────────────

const _initPromises = new Map<string, Promise<void>>();

// ── JSON shapes from resource files ───────────────────────────────────

interface RawNumericOption { value: unknown; label?: string }
interface RawStringOption { value: unknown; label?: string }

interface TaxonomyRacesJson { options?: RawNumericOption[] }
interface TaxonomyAttributesJson {
  editorOptions?: RawNumericOption[];
  filterOptions?: RawStringOption[];
  cardImageOptions?: RawStringOption[];
}
interface TaxonomyLicensesJson { options?: RawNumericOption[] }
interface TaxonomyLevelsJson { min?: number; max?: number }

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Build a locale-specific path.  e.g.  races.json (default)  or  races.en.json */
function localePath(basePath: string, name: string, locale: string): string {
  if (locale === 'en') return `${basePath}/${name}.en.json`;
  // Chinese or unknown → use default (no suffix)
  return `${basePath}/${name}.json`;
}

/**
 * Fetch a taxonomy resource, trying the locale-specific file first,
 * then falling back to the default (Chinese) file.
 */
async function fetchLocaleJson<T>(
  basePath: string,
  name: string,
  locale: string,
): Promise<T | null> {
  // Try locale-specific file
  if (locale !== 'zh') {
    const result = await fetchJson<T>(`${basePath}/${name}.${locale}.json`);
    if (result) return result;
  }
  // Fallback to default file
  return fetchJson<T>(`${basePath}/${name}.json`);
}

// ── Initialization ────────────────────────────────────────────────────

/**
 * Load taxonomy config from static resource files.
 *
 * @param locale  Language code (e.g. "zh", "en").  "zh" loads the default files;
 *                other values load `*.{locale}.json`, falling back to defaults.
 * @param basePath  Base URL for taxonomy resource files.
 *
 * Falls back to hardcoded defaults on any failure.
 * Safe to call multiple times — caches the result per locale.
 */
export function initTaxonomyConfig(locale = 'zh', basePath = '/resources/taxonomy'): Promise<void> {
  const lang = locale.split('-')[0];
  const existing = _initPromises.get(lang);
  if (existing) return existing;

  const promise = (async () => {
    const results = await Promise.allSettled([
      fetchLocaleJson<TaxonomyRacesJson>(basePath, 'races', lang),
      fetchLocaleJson<TaxonomyAttributesJson>(basePath, 'attributes', lang),
      fetchLocaleJson<TaxonomyLicensesJson>(basePath, 'licenses', lang),
      fetchLocaleJson<TaxonomyLevelsJson>(basePath, 'levels', lang),
    ]);

    const [racesResult, attrsResult, licensesResult, levelsResult] = results;

    if (racesResult.status === 'fulfilled' && racesResult.value?.options) {
      replaceArray(RACE_OPTIONS, parseNumericOptions(racesResult.value.options));
    }

    if (attrsResult.status === 'fulfilled' && attrsResult.value) {
      const attrs = attrsResult.value;
      if (attrs.editorOptions) replaceArray(ATTRIBUTE_OPTIONS, parseNumericOptions(attrs.editorOptions));
      if (attrs.filterOptions) replaceArray(ATTRIBUTE_FILTER_OPTIONS, parseStringOptions(attrs.filterOptions));
      if (attrs.cardImageOptions) replaceArray(CARD_IMAGE_ATTRIBUTE_OPTIONS, parseStringOptionItems(attrs.cardImageOptions));
    }

    if (licensesResult.status === 'fulfilled' && licensesResult.value?.options) {
      replaceArray(PERMISSION_OPTIONS, parseNumericOptions(licensesResult.value.options));
    }

    if (levelsResult.status === 'fulfilled' && levelsResult.value) {
      const levels = levelsResult.value;
      if (typeof levels.min === 'number') LEVEL_MIN = levels.min;
      if (typeof levels.max === 'number') LEVEL_MAX = levels.max;
    }
  })();

  _initPromises.set(lang, promise);
  return promise;
}
