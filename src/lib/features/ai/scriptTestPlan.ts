export type ScriptTestLocation =
  | 'deck'
  | 'hand'
  | 'mzone'
  | 'szone'
  | 'grave'
  | 'removed'
  | 'banished'
  | 'extra';

export type ScriptTestPosition =
  | 'faceup_attack'
  | 'facedown_attack'
  | 'faceup_defense'
  | 'facedown_defense';

export type ScriptTestSetupCard = {
  code: number;
  controller: number;
  owner: number;
  location: ScriptTestLocation | number;
  sequence?: number;
  position: ScriptTestPosition | number;
};

export type ScriptTestCheck =
  | { kind: 'load-script'; code?: number }
  | { kind: 'start-duel' }
  | { kind: 'advance'; maxSteps: number }
  | { kind: 'assert-no-redtext' }
  | { kind: 'assert-lp'; player: number; equals: number }
  | {
      kind: 'assert-field-count';
      player: number;
      location: ScriptTestLocation | number;
      equals?: number;
      min?: number;
      max?: number;
    };

export type ScriptTestPlan = {
  version: 1;
  cardCode: number;
  seed?: number | number[];
  start?: number | Record<string, unknown>;
  includeScripts: string[];
  setup: ScriptTestSetupCard[];
  checks: ScriptTestCheck[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toPositiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeKind(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[A-Z]/g, (item) => `-${item.toLowerCase()}`)
    .replace(/_/g, '-')
    .replace(/^-+/, '');
}

function normalizeIncludeScript(value: unknown) {
  if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
    const code = toPositiveInteger(value);
    return code ? `c${code}.lua` : null;
  }
  const fileName = String(value ?? '').trim().replace(/\\/g, '/').split('/').pop() ?? '';
  if (!fileName.toLowerCase().endsWith('.lua')) return null;
  return fileName;
}

function normalizeSetupCard(value: unknown): ScriptTestSetupCard | null {
  if (!isRecord(value)) return null;
  const code = toPositiveInteger(value.code);
  if (!code) return null;
  return {
    code,
    controller: Math.max(0, Math.min(1, Math.round(toFiniteNumber(value.controller) ?? 0))),
    owner: Math.max(0, Math.min(1, Math.round(toFiniteNumber(value.owner) ?? toFiniteNumber(value.controller) ?? 0))),
    location: typeof value.location === 'number' ? value.location : String(value.location ?? 'hand').trim() as ScriptTestLocation,
    sequence: value.sequence == null ? undefined : Math.max(0, Math.round(toFiniteNumber(value.sequence) ?? 0)),
    position: typeof value.position === 'number' ? value.position : String(value.position ?? 'faceup_attack').trim() as ScriptTestPosition,
  };
}

function normalizeCheck(value: unknown): ScriptTestCheck | null {
  if (!isRecord(value)) return null;
  const kind = normalizeKind(value.kind);
  if (kind === 'load-script') {
    const code = value.code == null ? undefined : toPositiveInteger(value.code) ?? undefined;
    return { kind, code };
  }
  if (kind === 'start-duel') return { kind };
  if (kind === 'advance') {
    return { kind, maxSteps: Math.max(1, Math.min(500, Math.round(toFiniteNumber(value.maxSteps) ?? 80))) };
  }
  if (kind === 'assert-no-redtext') return { kind };
  if (kind === 'assert-lp') {
    const equals = toFiniteNumber(value.equals);
    if (equals == null) return null;
    return {
      kind,
      player: Math.max(0, Math.min(1, Math.round(toFiniteNumber(value.player) ?? 0))),
      equals,
    };
  }
  if (kind === 'assert-field-count') {
    return {
      kind,
      player: Math.max(0, Math.min(1, Math.round(toFiniteNumber(value.player) ?? 0))),
      location: typeof value.location === 'number' ? value.location : String(value.location ?? 'mzone').trim() as ScriptTestLocation,
      equals: value.equals == null ? undefined : toFiniteNumber(value.equals) ?? undefined,
      min: value.min == null ? undefined : toFiniteNumber(value.min) ?? undefined,
      max: value.max == null ? undefined : toFiniteNumber(value.max) ?? undefined,
    };
  }
  return null;
}

function normalizeSeed(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!Array.isArray(value)) return undefined;
  const seed = value
    .map((item) => toFiniteNumber(item))
    .filter((item): item is number => item !== null)
    .map((item) => Math.trunc(item));
  return seed.length ? seed.slice(0, 8) : undefined;
}

export function normalizeScriptTestPlan(value: unknown, fallbackCardCode: number): ScriptTestPlan {
  const input = isRecord(value) ? value : {};
  const cardCode = toPositiveInteger(input.cardCode) ?? fallbackCardCode;
  if (!toPositiveInteger(cardCode)) throw new Error('script test plan cardCode is required');

  const includeScripts = [
    `c${cardCode}.lua`,
    ...(Array.isArray(input.includeScripts) ? input.includeScripts : []),
  ]
    .map(normalizeIncludeScript)
    .filter((item): item is string => Boolean(item));

  const setup = (Array.isArray(input.setup) ? input.setup : [])
    .map(normalizeSetupCard)
    .filter((item): item is ScriptTestSetupCard => Boolean(item));
  for (const card of setup) includeScripts.push(`c${card.code}.lua`);

  const checks = (Array.isArray(input.checks) ? input.checks : [])
    .map(normalizeCheck)
    .filter((item): item is ScriptTestCheck => Boolean(item));

  return {
    version: 1,
    cardCode,
    seed: normalizeSeed(input.seed),
    start: typeof input.start === 'number' || isRecord(input.start) ? input.start : undefined,
    includeScripts: [...new Set(includeScripts)],
    setup,
    checks: checks.length ? checks : [{ kind: 'load-script' }, { kind: 'assert-no-redtext' }],
  };
}
