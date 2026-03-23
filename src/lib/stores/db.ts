import { writable, get, derived } from 'svelte/store';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import type { CardDataEntry, SearchFilters } from '$lib/types';
import en from '$lib/i18n/locales/en.json';
import zh from '$lib/i18n/locales/zh.json';

export interface CdbTab {
  id: string;
  path: string;
  name: string;
  /** Cached current page results from last search for fast tab switching */
  cachedCards: CardDataEntry[];
  cachedTotal: number;
  cachedPage: number;
  cachedFilters: string; // JSON of the filters used for the cache
  cachedSelectedIds: number[];
  cachedSelectedId: number | null;
  cachedSelectionAnchorId: number | null;
  isDirty: boolean;
}

export const tabs = writable<CdbTab[]>([]);
export const activeTabId = writable<string | null>(null);

export interface RecentCdbEntry {
  path: string;
  name: string;
}

type UndoOperation =
  | {
      kind: 'modify';
      label: string;
      affectedIds: number[];
      previousCards: Array<CardDataEntry | null>;
    }
  | {
      kind: 'delete';
      label: string;
      affectedIds: number[];
      deletedCards: CardDataEntry[];
    };

const undoHistory = new Map<string, UndoOperation[]>();
const RECENT_CDB_HISTORY_KEY = 'recent-cdb-history';
const MAX_RECENT_CDB_HISTORY = 6;

export const recentCdbHistory = writable<RecentCdbEntry[]>([]);

export const activeTab = derived(
  [tabs, activeTabId],
  ([$tabs, $activeTabId]) => $tabs.find(t => t.id === $activeTabId) || null
);

export const isDbLoaded = derived(activeTab, ($activeTab) => $activeTab !== null);

interface OpenCdbTabResponse {
  name: string;
  cachedCards: CardDataEntry[];
  cachedTotal: number;
}

interface SearchCardsPageResponse {
  cards: CardDataEntry[];
  total: number;
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeRecentCdbHistory(value: unknown): RecentCdbEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaths = new Set<string>();
  const entries: RecentCdbEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const path = typeof item.path === 'string' ? item.path.trim() : '';
    if (!path || seenPaths.has(path)) continue;

    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : path.split(/[/\\]/).pop() || path;

    seenPaths.add(path);
    entries.push({ path, name });

    if (entries.length >= MAX_RECENT_CDB_HISTORY) {
      break;
    }
  }

  return entries;
}

function persistRecentCdbHistory(entries: RecentCdbEntry[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(RECENT_CDB_HISTORY_KEY, JSON.stringify(entries));
}

function pushRecentCdbEntry(entry: RecentCdbEntry) {
  recentCdbHistory.update((current) => {
    const next = [
      entry,
      ...current.filter((item) => item.path !== entry.path),
    ].slice(0, MAX_RECENT_CDB_HISTORY);
    persistRecentCdbHistory(next);
    return next;
  });
}

export function loadRecentCdbHistory() {
  if (!canUseLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(RECENT_CDB_HISTORY_KEY);
    recentCdbHistory.set(normalizeRecentCdbHistory(raw ? JSON.parse(raw) : []));
  } catch {
    recentCdbHistory.set([]);
  }
}

export function removeRecentCdbHistoryEntry(path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath) return;

  recentCdbHistory.update((current) => {
    const next = current.filter((item) => item.path !== normalizedPath);
    persistRecentCdbHistory(next);
    return next;
  });
}

function cloneCard(card: CardDataEntry): CardDataEntry {
  return {
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [],
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
    ruleCode: Number(card.ruleCode ?? 0),
  };
}

function getUndoStack(tabId: string): UndoOperation[] {
  let stack = undoHistory.get(tabId);
  if (!stack) {
    stack = [];
    undoHistory.set(tabId, stack);
  }
  return stack;
}

function pushUndoOperation(tabId: string, operation: UndoOperation) {
  const stack = getUndoStack(tabId);
  stack.push(operation);
  if (stack.length > 100) {
    stack.shift();
  }
}

function toLikePattern(input: string): string {
  const normalized = input.trim();
  if (!normalized) return '%';

  // If the user included % or _ explicitly, treat them as LIKE wildcards
  // for power-user filtering.  Otherwise wrap with % for substring match.
  const hasWildcard = normalized.includes('%') || normalized.includes('_');
  return hasWildcard ? normalized : `%${normalized}%`;
}

function splitSearchTerms(input: string): string[] {
  return input
    .split(/(?:%%|\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSetcodeFilter(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const hex = normalized.toLowerCase().startsWith('0x') ? normalized.slice(2) : normalized;
  if (!/^[\da-f]{1,4}$/i.test(hex)) return null;

  return parseInt(hex, 16) & 0xffff;
}

type RuleToken =
  | { type: 'identifier'; value: string }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' };

type RuleFieldKind = 'numeric' | 'mask';
type RuleValue = { kind: 'number'; value: number } | { kind: 'field'; field: RuleFieldDefinition } | { kind: 'keyword'; value: string };
type RuleExpressionErrorCode =
  | 'unterminated_string'
  | 'unexpected_token'
  | 'unexpected_end'
  | 'expected_left_value'
  | 'expected_right_value'
  | 'expected_closing_parenthesis'
  | 'expected_comparison_operator'
  | 'contains_requires_mask'
  | 'field_rejects_keyword'
  | 'unsupported_value'
  | 'unexpected_trailing_tokens';

interface RuleFieldDefinition {
  key: string;
  kind: RuleFieldKind;
  sql: string;
  aliases: string[];
  values?: Record<string, number>;
}

export class RuleExpressionError extends Error {
  code: RuleExpressionErrorCode;
  details: Record<string, string>;

  constructor(code: RuleExpressionErrorCode, details: Record<string, string> = {}) {
    super(code);
    this.name = 'RuleExpressionError';
    this.code = code;
    this.details = details;
  }
}

function createRuleExpressionError(code: RuleExpressionErrorCode, details: Record<string, string> = {}): RuleExpressionError {
  return new RuleExpressionError(code, details);
}

function fillRuleExpressionTemplate(template: string, details: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => details[key] ?? '');
}

export function getRuleExpressionErrorMessage(error: RuleExpressionError, localeCode: string): string {
  const messages = localeCode.startsWith('zh') ? zh.search : en.search;
  const reasonKey = `rule_error_${error.code}` as keyof typeof messages;
  const reasonTemplate = messages[reasonKey];
  const reason = typeof reasonTemplate === 'string'
    ? fillRuleExpressionTemplate(reasonTemplate, error.details)
    : error.code;

  return fillRuleExpressionTemplate(messages.rule_invalid, { reason });
}

function normalizeRuleKeyword(input: string): string {
  return input.trim().toLowerCase().replace(/[\s_\-/]+/g, '');
}

function addAliases(target: Record<string, number>, value: number, aliases: string[]) {
  for (const alias of aliases) {
    const normalized = normalizeRuleKeyword(alias);
    if (normalized) {
      target[normalized] = value;
    }
  }
}

const RULE_OPERATOR_ALIASES: Record<string, string> = {
  and: 'and',
  '&&': 'and',
  且: 'and',
  并且: 'and',
  or: 'or',
  '||': 'or',
  或: 'or',
  或者: 'or',
  not: 'not',
  非: 'not',
  contains: 'contains',
  has: 'contains',
  包含: 'contains',
};

let ruleFieldMapCache: Map<string, RuleFieldDefinition> | null = null;

function getRuleFieldMap(): Map<string, RuleFieldDefinition> {
  if (ruleFieldMapCache) {
    return ruleFieldMapCache;
  }

  const attributeValueMap: Record<string, number> = {};
  addAliases(attributeValueMap, 0x01, ['earth', '地']);
  addAliases(attributeValueMap, 0x02, ['water', '水']);
  addAliases(attributeValueMap, 0x04, ['fire', '炎', '火']);
  addAliases(attributeValueMap, 0x08, ['wind', '风']);
  addAliases(attributeValueMap, 0x10, ['light', '光']);
  addAliases(attributeValueMap, 0x20, ['dark', '暗']);
  addAliases(attributeValueMap, 0x40, ['divine', '神']);
  for (const [key, label] of Object.entries(en.search.attributes)) addAliases(attributeValueMap, ATTRIBUTE_MAP[key], [key, label]);
  for (const [key, label] of Object.entries(zh.search.attributes)) addAliases(attributeValueMap, ATTRIBUTE_MAP[key], [key, label]);

  const raceValueMap: Record<string, number> = {};
  for (const [key, value] of Object.entries(RACE_MAP)) addAliases(raceValueMap, value, [key]);
  for (const [key, label] of Object.entries(en.search.races)) addAliases(raceValueMap, RACE_MAP[key], [key, label]);
  for (const [key, label] of Object.entries(zh.search.races)) addAliases(raceValueMap, RACE_MAP[key], [key, label]);

  const typeValueMap: Record<string, number> = {};
  for (const [key, value] of Object.entries(TYPE_MAP)) addAliases(typeValueMap, value, [key]);
  for (const [key, label] of Object.entries(en.search.types)) addAliases(typeValueMap, TYPE_MAP[key], [key, label]);
  for (const [key, label] of Object.entries(zh.search.types)) addAliases(typeValueMap, TYPE_MAP[key], [key, label]);
  for (const [key, value] of Object.entries(SUBTYPE_MAP)) addAliases(typeValueMap, value, [key]);

  const typeLabelKeys: Record<string, string> = {
    normal: 'normal',
    effect: 'effect',
    fusion: 'fusion',
    ritual: 'ritual',
    spirit: 'spirit',
    union: 'union',
    gemini: 'gemini',
    tuner: 'tuner',
    synchro: 'synchro',
    token: 'token',
    quickplay: 'quickplay',
    continuous_spell: 'continuous',
    equip: 'equip',
    field: 'field',
    counter: 'counter',
    flip: 'flip',
    toon: 'toon',
    xyz: 'xyz',
    pendulum: 'pendulum',
    spssummon: 'spssummon',
    link: 'link',
    continuous_trap: 'continuous',
    ritual_spell: 'ritual',
  };
  for (const [key, labelKey] of Object.entries(typeLabelKeys)) {
    const value = key === 'continuous_spell' || key === 'continuous_trap'
      ? 0x20000
      : key === 'ritual_spell'
        ? 0x80
        : SUBTYPE_MAP[key];
    if (!value) continue;
    addAliases(typeValueMap, value, [key]);
    addAliases(typeValueMap, value, [en.editor.subtype[labelKey as keyof typeof en.editor.subtype]]);
    addAliases(typeValueMap, value, [zh.editor.subtype[labelKey as keyof typeof zh.editor.subtype]]);
  }

  const linkMarkerValueMap: Record<string, number> = {};
  addAliases(linkMarkerValueMap, 0x01, ['downleft', 'bottomleft', '左下', '↙']);
  addAliases(linkMarkerValueMap, 0x02, ['down', 'bottom', '下', '↓']);
  addAliases(linkMarkerValueMap, 0x04, ['downright', 'bottomright', '右下', '↘']);
  addAliases(linkMarkerValueMap, 0x08, ['left', '左', '←']);
  addAliases(linkMarkerValueMap, 0x20, ['right', '右', '→']);
  addAliases(linkMarkerValueMap, 0x40, ['upleft', 'topleft', '左上', '↖']);
  addAliases(linkMarkerValueMap, 0x80, ['up', 'top', '上', '↑']);
  addAliases(linkMarkerValueMap, 0x100, ['upright', 'topright', '右上', '↗']);

  const definitions: RuleFieldDefinition[] = [
    { key: 'atk', kind: 'numeric', sql: 'datas.atk', aliases: ['atk', '攻击力'] },
    { key: 'def', kind: 'numeric', sql: 'datas.def', aliases: ['def', '守备力'] },
    { key: 'level', kind: 'numeric', sql: '(datas.level & 255)', aliases: ['level', 'lv', '等级', '星级', '阶级'] },
    { key: 'scale', kind: 'numeric', sql: '((datas.level >> 24) & 255)', aliases: ['scale', 'ls', 'lscale', '左刻度', '左灵摆刻度', '灵摆刻度'] },
    { key: 'rscale', kind: 'numeric', sql: '((datas.level >> 16) & 255)', aliases: ['rscale', 'rs', 'rightscale', '右刻度', '右灵摆刻度'] },
    { key: 'attribute', kind: 'mask', sql: 'datas.attribute', aliases: ['attribute', 'attr', '属性'], values: attributeValueMap },
    { key: 'race', kind: 'mask', sql: 'datas.race', aliases: ['race', 'rc', '种族'], values: raceValueMap },
    { key: 'type', kind: 'mask', sql: 'datas.type', aliases: ['type', 'tp', 'cardtype', 'types', '卡片类型', '卡片种类', '种类'], values: typeValueMap },
    { key: 'linkmarker', kind: 'mask', sql: `(CASE WHEN (datas.type & ${SUBTYPE_MAP.link}) = ${SUBTYPE_MAP.link} THEN datas.def END)`, aliases: ['linkmarker', 'lm', 'linkmarkers', 'marker', 'markers', '连接标记', '连接箭头'], values: linkMarkerValueMap },
  ];

  ruleFieldMapCache = new Map<string, RuleFieldDefinition>();
  for (const definition of definitions) {
    for (const alias of definition.aliases) {
      ruleFieldMapCache.set(normalizeRuleKeyword(alias), definition);
    }
  }

  return ruleFieldMapCache;
}

function tokenizeRuleExpression(input: string): RuleToken[] {
  const tokens: RuleToken[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const twoCharOperator = input.slice(index, index + 2);
    if (['>=', '<=', '!=', '<>'].includes(twoCharOperator)) {
      tokens.push({ type: 'operator', value: twoCharOperator });
      index += 2;
      continue;
    }

    if (['>', '<', '='].includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (char === '&' || char === '|') {
      const repeated = input[index + 1] === char;
      const rawOperator = repeated ? char + char : char;
      tokens.push({ type: 'operator', value: RULE_OPERATOR_ALIASES[rawOperator] ?? rawOperator });
      index += repeated ? 2 : 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char });
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      let endIndex = index + 1;
      while (endIndex < input.length && input[endIndex] !== quote) {
        endIndex += 1;
      }
      if (endIndex >= input.length) {
        throw createRuleExpressionError('unterminated_string');
      }
      tokens.push({ type: 'string', value: input.slice(index + 1, endIndex) });
      index = endIndex + 1;
      continue;
    }

    const numberMatch = input.slice(index).match(/^-?\d+/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    const identifierMatch = input.slice(index).match(/^[\p{L}_][\p{L}\p{N}_-]*/u);
    if (identifierMatch) {
      const value = identifierMatch[0];
      const normalized = normalizeRuleKeyword(value);
      if (RULE_OPERATOR_ALIASES[normalized]) {
        tokens.push({ type: 'operator', value: RULE_OPERATOR_ALIASES[normalized] });
      } else {
        tokens.push({ type: 'identifier', value });
      }
      index += identifierMatch[0].length;
      continue;
    }

    throw createRuleExpressionError('unexpected_token', { token: char });
  }

  return tokens;
}

function parseRuleExpression(input: string): string | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const tokens = tokenizeRuleExpression(normalized);
  let index = 0;

  function peek(): RuleToken | undefined {
    return tokens[index];
  }

  function consume(): RuleToken {
    const token = tokens[index];
    if (!token) {
      throw createRuleExpressionError('unexpected_end');
    }
    index += 1;
    return token;
  }

  function parseLeftValue(): RuleValue {
    const token = consume();
    if (token.type === 'number') {
      return { kind: 'number', value: token.value };
    }

    if (token.type === 'identifier') {
      const field = getRuleFieldMap().get(normalizeRuleKeyword(token.value));
      if (field) {
        return { kind: 'field', field };
      }
    }

    throw createRuleExpressionError('expected_left_value');
  }

  function parseRightValue(): RuleValue {
    const token = consume();
    if (token.type === 'number') {
      return { kind: 'number', value: token.value };
    }

    if (token.type === 'identifier') {
      const field = getRuleFieldMap().get(normalizeRuleKeyword(token.value));
      if (field) {
        return { kind: 'field', field };
      }
      return { kind: 'keyword', value: token.value };
    }

    if (token.type === 'string') {
      return { kind: 'keyword', value: token.value };
    }

    throw createRuleExpressionError('expected_right_value');
  }

  function resolveSqlValue(field: RuleFieldDefinition | null, value: RuleValue): string {
    if (value.kind === 'number') {
      return String(value.value);
    }

    if (value.kind === 'field') {
      return value.field.sql;
    }

    if (!field?.values) {
      throw createRuleExpressionError('field_rejects_keyword', { field: field?.key ?? 'unknown' });
    }

    const resolved = field.values[normalizeRuleKeyword(value.value)];
    if (resolved === undefined) {
      throw createRuleExpressionError('unsupported_value', { field: field.key, value: value.value });
    }

    return String(resolved);
  }

  function parseComparison(): string {
    if (peek()?.type === 'paren' && peek()?.value === '(') {
      consume();
      const nested = parseOr();
      const closing = consume();
      if (closing.type !== 'paren' || closing.value !== ')') {
        throw createRuleExpressionError('expected_closing_parenthesis');
      }
      return `(${nested})`;
    }

    const left = parseLeftValue();
    const operator = consume();
    if (operator.type !== 'operator' || !['>', '<', '>=', '<=', '=', '!=', '<>', 'contains'].includes(operator.value)) {
      throw createRuleExpressionError('expected_comparison_operator');
    }

    const right = parseRightValue();

    if (operator.value === 'contains') {
      if (left.kind !== 'field' || left.field.kind !== 'mask') {
        throw createRuleExpressionError('contains_requires_mask');
      }
      const rightSql = resolveSqlValue(left.field, right);
      return `((${left.field.sql} & ${rightSql}) = ${rightSql})`;
    }

    const sqlOperator = operator.value === '!=' ? '<>' : operator.value;
    const leftSql = left.kind === 'field' ? left.field.sql : String(left.value);
    const rightSql = resolveSqlValue(left.kind === 'field' ? left.field : null, right);
    return `(${leftSql} ${sqlOperator} ${rightSql})`;
  }

  function parseNot(): string {
    const token = peek();
    if (token?.type === 'operator' && token.value === 'not') {
      consume();
      return `(NOT ${parseNot()})`;
    }
    return parseComparison();
  }

  function parseAnd(): string {
    let expression = parseNot();

    while (true) {
      const token = peek();
      if (token?.type === 'operator' && token.value === 'and') {
        consume();
        expression = `(${expression} AND ${parseNot()})`;
        continue;
      }
      break;
    }

    return expression;
  }

  function parseOr(): string {
    let expression = parseAnd();

    while (true) {
      const token = peek();
      if (token?.type === 'operator' && token.value === 'or') {
        consume();
        expression = `(${expression} OR ${parseAnd()})`;
        continue;
      }
      break;
    }

    return expression;
  }

  const expression = parseOr();
  if (index !== tokens.length) {
    throw createRuleExpressionError('unexpected_trailing_tokens');
  }

  return expression;
}

async function openCdbAtPath(selected: string): Promise<string | null> {
  const existing = get(tabs).find(t => t.path === selected);
  if (existing) {
    activeTabId.set(existing.id);
    pushRecentCdbEntry({ path: existing.path, name: existing.name });
    return existing.id;
  }

  try {
    const id = crypto.randomUUID();
    const response = await invoke<OpenCdbTabResponse>('open_cdb_tab', { tabId: id, path: selected });

    const tab: CdbTab = {
      id,
      path: selected,
      name: response.name,
      cachedCards: response.cachedCards,
      cachedTotal: response.cachedTotal,
      cachedPage: 1,
      cachedFilters: '{}',
      cachedSelectedIds: response.cachedCards.length > 0 ? [response.cachedCards[0].code] : [],
      cachedSelectedId: response.cachedCards[0]?.code ?? null,
      cachedSelectionAnchorId: response.cachedCards[0]?.code ?? null,
      isDirty: false
    };
    tabs.update(t => [...t, tab]);
    activeTabId.set(id);
    pushRecentCdbEntry({ path: selected, name: response.name });
    return id;
  } catch (err) {
    console.error('Failed to read CDB:', err);
    return null;
  }
}

export async function openCdbPath(path: string): Promise<string | null> {
  const normalizedPath = path.trim();
  if (!normalizedPath) return null;
  return openCdbAtPath(normalizedPath);
}

function buildSearchQuery(filters: SearchFilters = {}) {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.name) {
    const keywords = splitSearchTerms(filters.name);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((keyword, index) => {
        const key = `name${index}`;
        params[key] = toLikePattern(keyword);
        return `(texts.name LIKE :${key} OR texts.desc LIKE :${key})`;
      });
      conditions.push(`(${keywordConditions.join(' AND ')})`);
    }
  }

  if (filters.id) {
    const parsedId = parseInt(filters.id);
    if (!isNaN(parsedId)) {
      conditions.push('(datas.id = :id OR datas.alias = :id)');
      params.id = parsedId;
    }
  }

  if (filters.desc) {
    const keywords = splitSearchTerms(filters.desc);
    if (keywords.length > 0) {
      const keywordConditions = keywords.map((keyword, index) => {
        const key = `desc${index}`;
        params[key] = toLikePattern(keyword);
        return `texts.desc LIKE :${key}`;
      });
      conditions.push(`(${keywordConditions.join(' AND ')})`);
    }
  }

  if (filters.atkMin !== '' && filters.atkMin !== undefined) {
    const v = parseInt(filters.atkMin.toString());
    if (!isNaN(v)) conditions.push(`datas.atk >= ${v}`);
  }
  if (filters.atkMax !== '' && filters.atkMax !== undefined) {
    const v = parseInt(filters.atkMax.toString());
    if (!isNaN(v)) conditions.push(`datas.atk <= ${v}`);
  }
  if (filters.defMin !== '' && filters.defMin !== undefined) {
    const v = parseInt(filters.defMin.toString());
    if (!isNaN(v)) conditions.push(`datas.def >= ${v}`);
  }
  if (filters.defMax !== '' && filters.defMax !== undefined) {
    const v = parseInt(filters.defMax.toString());
    if (!isNaN(v)) conditions.push(`datas.def <= ${v}`);
  }

  const hasMonsterOnlyFilter =
    (filters.atkMin !== '' && filters.atkMin !== undefined) ||
    (filters.atkMax !== '' && filters.atkMax !== undefined) ||
    (filters.defMin !== '' && filters.defMin !== undefined) ||
    (filters.defMax !== '' && filters.defMax !== undefined) ||
    (filters.attribute ?? '') !== '' ||
    (filters.race ?? '') !== '';

  if (hasMonsterOnlyFilter && filters.type && filters.type !== 'monster') {
    conditions.push('1=0');
  }

  if (filters.type && TYPE_MAP[filters.type] !== undefined) {
    const typeBit = TYPE_MAP[filters.type];
    conditions.push(`(datas.type & ${typeBit}) = ${typeBit}`);
  }

  if (filters.subtype) {
    if (filters.subtype === 'normal' && filters.type === 'spell') {
      conditions.push(`(datas.type & ${SPELL_SUBTYPE_MASK}) = 0`);
    } else if (filters.subtype === 'normal' && filters.type === 'trap') {
      conditions.push(`(datas.type & ${TRAP_SUBTYPE_MASK}) = 0`);
    } else {
      let subtypeBit: number | undefined;
      if (filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap') subtypeBit = 0x20000;
      else if (filters.subtype === 'ritual_spell') subtypeBit = 0x80;
      else subtypeBit = SUBTYPE_MAP[filters.subtype];
      if (subtypeBit !== undefined) conditions.push(`(datas.type & ${subtypeBit}) = ${subtypeBit}`);
    }
  }

  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    conditions.push(`datas.attribute = ${ATTRIBUTE_MAP[filters.attribute]}`);
  }

  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    conditions.push(`datas.race = ${RACE_MAP[filters.race]}`);
  }

  const setcodeFilters = [filters.setcode1, filters.setcode2, filters.setcode3, filters.setcode4];
  for (const rawValue of setcodeFilters) {
    if (!rawValue) continue;
    const parsedSetcode = parseSetcodeFilter(rawValue);
    if (parsedSetcode === null) continue;
    conditions.push(
      `(
        ((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${parsedSetcode}
      )`
    );
  }

  if (filters.rule) {
    const parsedRule = parseRuleExpression(filters.rule);
    if (parsedRule) {
      conditions.push(parsedRule);
    }
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}

// --- Type/Attribute/Race bit constants from YGOPro ---
const TYPE_MAP: Record<string, number> = {
  monster: 0x1,
  spell: 0x2,
  trap: 0x4,
};

const ATTRIBUTE_MAP: Record<string, number> = {
  earth: 0x01,
  water: 0x02,
  fire: 0x04,
  wind: 0x08,
  light: 0x10,
  dark: 0x20,
  divine: 0x40,
};

const RACE_MAP: Record<string, number> = {
  warrior: 0x1,
  spellcaster: 0x2,
  fairy: 0x4,
  fiend: 0x8,
  zombie: 0x10,
  machine: 0x20,
  aqua: 0x40,
  pyro: 0x80,
  rock: 0x100,
  wingedbeast: 0x200,
  plant: 0x400,
  insect: 0x800,
  thunder: 0x1000,
  dragon: 0x2000,
  beast: 0x4000,
  beastwarrior: 0x8000,
  dinosaur: 0x10000,
  fish: 0x20000,
  seaserpent: 0x40000,
  reptile: 0x80000,
  psychic: 0x100000,
  divinebeast: 0x200000,
  creatorgod: 0x400000,
  wyrm: 0x800000,
  cyberse: 0x1000000,
  illusion: 0x2000000,
};

// Sub-type bit constants.
// NOTE: In YGOPro, some bit values are intentionally shared across card
// categories.  The correct value is determined by combining the sub-type
// bit with the main type bit (monster 0x1, spell 0x2, trap 0x4).
export const SUBTYPE_MAP: Record<string, number> = {
  // Monster sub-types
  normal: 0x10,
  effect: 0x20,
  fusion: 0x40,
  ritual: 0x80,           // Shares bit with ritual_spell — disambiguated by main type
  spirit: 0x200,
  union: 0x400,
  gemini: 0x800,
  tuner: 0x1000,
  synchro: 0x2000,
  token: 0x4000,
  flip: 0x200000,
  toon: 0x400000,
  xyz: 0x800000,
  pendulum: 0x1000000,
  spssummon: 0x2000000,
  link: 0x4000000,
  // Spell sub-types
  quickplay: 0x10000,
  continuous_spell: 0x20000, // Shares bit with continuous_trap
  equip: 0x40000,
  field: 0x80000,
  ritual_spell: 0x80,        // Shares bit with monster ritual
  // Trap sub-types
  continuous_trap: 0x20000,  // Shares bit with continuous_spell
  counter: 0x100000,
};

const SPELL_SUBTYPE_MASK = 0x10000 | 0x20000 | 0x40000 | 0x80000 | 0x80;
const TRAP_SUBTYPE_MASK = 0x20000 | 0x100000;

/** Open a .cdb file and add it as a new tab. Returns the tab id or null. */
export async function openCdbFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    return openCdbAtPath(selected);
  }
  return null;
}

export async function openCdbHistoryEntry(path: string): Promise<string | null> {
  return openCdbPath(path);
}

/** Create a new .cdb file, save it and open as a new tab. */
export async function createCdbFile(): Promise<string | null> {
  const selected = await save({
    title: 'Create New CDB',
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    try {
      const id = crypto.randomUUID();
      const response = await invoke<OpenCdbTabResponse>('create_cdb_tab', { tabId: id, path: selected });

      const tab: CdbTab = {
        id,
        path: selected,
        name: response.name,
        cachedCards: [],
        cachedTotal: 0,
        cachedPage: 1,
        cachedFilters: '{}',
        cachedSelectedIds: [],
        cachedSelectedId: null,
        cachedSelectionAnchorId: null,
        isDirty: false
      };
      tabs.update(t => [...t, tab]);
      activeTabId.set(id);
      pushRecentCdbEntry({ path: selected, name: response.name });
      return id;
    } catch (err) {
      console.error("Failed to create CDB:", err);
      return null;
    }
  }
  return null;
}

/** Close a tab by its id */
export async function closeTab(tabId: string) {
  const currentTabs = get(tabs);
  const idx = currentTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  try {
    await invoke('close_cdb_tab', { tabId });
  } catch (err) {
    console.error('Failed to close CDB tab:', err);
  }

  const newTabs = currentTabs.filter(t => t.id !== tabId);
  tabs.set(newTabs);
  undoHistory.delete(tabId);

  if (get(activeTabId) === tabId) {
    if (newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      activeTabId.set(newTabs[newIdx].id);
    } else {
      activeTabId.set(null);
    }
  }
}

/** Save the active tab's CDB back to disk */
export async function saveCdbFile(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  return saveCdbTab(tab.id);
}

export async function saveCdbTab(tabId: string): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await invoke('save_cdb_tab', { tabId: tab.id });
    markTabDirty(tab.id, false);
    return true;
  } catch (err) {
    console.error('Failed to save CDB:', err);
    return false;
  }
}

/** Get cached cards for the active tab (for instant tab switching) */
export function getCachedCards(): CardDataEntry[] {
  const tab = get(activeTab);
  return tab ? tab.cachedCards : [];
}

export function getCachedTotal(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedTotal : 0;
}

export function getCachedPage(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedPage : 1;
}

export function getCachedFilters(): SearchFilters {
  const tab = get(activeTab);
  if (!tab) return {};

  try {
    return JSON.parse(tab.cachedFilters) as SearchFilters;
  } catch {
    return {};
  }
}

export function getCachedSelectedIds(): number[] {
  const tab = get(activeTab);
  return tab ? [...tab.cachedSelectedIds] : [];
}

export function getCachedSelectedId(): number | null {
  const tab = get(activeTab);
  return tab ? tab.cachedSelectedId : null;
}

export function getCachedSelectionAnchorId(): number | null {
  const tab = get(activeTab);
  return tab ? tab.cachedSelectionAnchorId : null;
}

export function cacheActiveTabSelection(selectedIds: number[], selectedId: number | null, selectionAnchorId: number | null) {
  const tabId = get(activeTabId);
  if (!tabId) return;

  tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            cachedSelectedIds: [...selectedIds],
            cachedSelectedId: selectedId,
            cachedSelectionAnchorId: selectionAnchorId,
          }
        : tab
    )
  );
}

export function hasUnsavedChanges(tabId: string | null = get(activeTabId)): boolean {
  if (!tabId) return false;
  const tab = get(tabs).find((item) => item.id === tabId);
  return tab?.isDirty ?? false;
}

function markTabDirty(tabId: string, isDirty = true) {
  tabs.update((currentTabs) =>
    currentTabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab))
  );
}

export function markActiveTabDirty(isDirty = true) {
  const tabId = get(activeTabId);
  if (!tabId) return;

  markTabDirty(tabId, isDirty);
}

function syncCachedCardsInTab(tabId: string, cards: CardDataEntry[]) {
  if (cards.length === 0) return;

  const nextByCode = new Map(cards.map((card) => [card.code, cloneCard(card)]));
  tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            cachedCards: tab.cachedCards.map((cachedCard) => nextByCode.get(cachedCard.code) ?? cachedCard),
          }
        : tab
    )
  );
}

export function hasUndoableAction(): boolean {
  const tabId = get(activeTabId);
  if (!tabId) return false;
  return getUndoStack(tabId).length > 0;
}

export function getLastUndoLabel(): string | null {
  const tabId = get(activeTabId);
  if (!tabId) return null;
  const stack = getUndoStack(tabId);
  return stack[stack.length - 1]?.label ?? null;
}

export async function undoLastOperation(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  const stack = getUndoStack(tab.id);
  const operation = stack.pop();
  if (!operation) return false;

  try {
    if (operation.kind === 'modify') {
      const cardsToRestore = operation.previousCards.filter((card): card is CardDataEntry => card !== null);
      const deletedIds = operation.affectedIds.filter((cardId, index) => operation.previousCards[index] === null);

      if (cardsToRestore.length > 0) {
        await invoke('modify_cards', {
          request: {
            tabId: tab.id,
            cards: cardsToRestore.map((card) => cloneCard(card)),
          },
        });
      }

      if (deletedIds.length > 0) {
        await invoke('delete_cards', {
          request: {
            tabId: tab.id,
            cardIds: deletedIds,
          },
        });
      }
    } else if (operation.deletedCards.length > 0) {
      await invoke('modify_cards', {
        request: {
          tabId: tab.id,
          cards: operation.deletedCards.map((card) => cloneCard(card)),
        },
      });
    }

    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error('Failed to undo operation:', err);
    stack.push(operation);
    return false;
  }
}

export async function getCardById(cardId: number): Promise<CardDataEntry | undefined> {
  const tab = get(activeTab);
  if (!tab) return undefined;
  return getCardByIdInTab(tab.id, cardId);
}

export async function getCardByIdInTab(tabId: string, cardId: number): Promise<CardDataEntry | undefined> {
  try {
    return await invoke<CardDataEntry | null>('get_card_by_id', { tabId, cardId }) ?? undefined;
  } catch (err) {
    console.error('Failed to fetch card by id:', err);
    return undefined;
  }
}

/** Modify (upsert) a card in the active tab's working CDB */
export async function modifyCard(card: CardDataEntry): Promise<boolean> {
  return modifyCards([card]);
}

export async function modifyCardsInTab(tabId: string, cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const previousCards = await Promise.all(cards.map((card) => getCardByIdInTab(tab.id, card.code)));
    await invoke('modify_cards', {
      request: {
        tabId: tab.id,
        cards: cards.map((card) => cloneCard(card)),
      },
    });
    pushUndoOperation(tab.id, {
      kind: 'modify',
      label: cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
      affectedIds: cards.map((card) => card.code),
      previousCards: previousCards.map((card) => card ?? null),
    });
    syncCachedCardsInTab(tab.id, cards);
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards:', err);
    return false;
  }
}

export async function modifyCards(cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;
  return modifyCardsInTab(tab.id, cards);
}

/** Delete a card from the active tab's working CDB by id */
export async function deleteCard(cardId: number): Promise<boolean> {
  return deleteCards([cardId]);
}

export async function deleteCards(cardIds: number[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    const deletedCards = (await Promise.all(cardIds.map((cardId) => getCardByIdInTab(tab.id, cardId))))
      .filter((card): card is CardDataEntry => card !== undefined)
      .map((card) => cloneCard(card));

    await invoke('delete_cards', {
      request: {
        tabId: tab.id,
        cardIds,
      },
    });

    if (deletedCards.length > 0) {
      pushUndoOperation(tab.id, {
        kind: 'delete',
        label: deletedCards.length === 1 ? `Delete card ${deletedCards[0].code}` : `Delete ${deletedCards.length} cards`,
        affectedIds: deletedCards.map((card) => card.code),
        deletedCards,
      });
    }
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error("Failed to delete cards:", err);
    return false;
  }
}

export async function queryCardsRaw(tabId: string, queryClause: string, params: Record<string, string | number> = {}): Promise<CardDataEntry[]> {
  try {
    return await invoke<CardDataEntry[]>('query_cards_raw', {
      request: {
        tabId,
        queryClause,
        params,
      },
    });
  } catch (err) {
    console.error('Failed to query cards:', err);
    return [];
  }
}

/** Search one page of cards in the active tab's CDB */
export async function searchCardsPage(filters: SearchFilters = {}, page = 1, pageSize = 50): Promise<{ cards: CardDataEntry[]; total: number }> {
  const tab = get(activeTab);
  if (!tab) return { cards: [], total: 0 };

  try {
    const { whereClause, params } = buildSearchQuery(filters);
    const safePage = Math.max(1, page);
    const response = await invoke<SearchCardsPageResponse>('search_cards_page', {
      request: {
        tabId: tab.id,
        whereClause,
        params,
        page: safePage,
        pageSize,
      },
    });

    tabs.update((currentTabs) =>
      currentTabs.map((item) =>
        item.id === tab.id
          ? {
              ...item,
              cachedCards: response.cards,
              cachedTotal: response.total,
              cachedPage: safePage,
              cachedFilters: JSON.stringify(filters),
            }
          : item
      )
    );

    return response;
  } catch (err) {
    if (err instanceof RuleExpressionError) {
      throw err;
    }
    console.error("Search failed:", err);
    return { cards: [], total: 0 };
  }
}
