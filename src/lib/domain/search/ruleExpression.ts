import en from '$lib/i18n/locales/en.json';
import zh from '$lib/i18n/locales/zh.json';
import {
  ATTRIBUTE_MAP,
  LINK_MARKER_NAME_TO_BIT,
  RACE_MAP,
  SUBTYPE_MAP,
  TYPE_MAP,
} from '$lib/domain/card/taxonomy';

type RuleToken =
  | { type: 'identifier'; value: string }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'paren'; value: '(' | ')' };

type RuleFieldKind = 'numeric' | 'mask';
type RuleValue = { kind: 'number'; value: number } | { kind: 'field'; field: RuleFieldDefinition } | { kind: 'keyword'; value: string };
export type RuleExpressionErrorCode =
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

function createRuleExpressionError(code: RuleExpressionErrorCode, details: Record<string, string> = {}) {
  return new RuleExpressionError(code, details);
}

function fillRuleExpressionTemplate(template: string, details: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => details[key] ?? '');
}

export function getRuleExpressionErrorMessage(error: RuleExpressionError, localeCode: string) {
  const messages = localeCode.startsWith('zh') ? zh.search : en.search;
  const reasonKey = `rule_error_${error.code}` as keyof typeof messages;
  const reasonTemplate = messages[reasonKey];
  const reason = typeof reasonTemplate === 'string'
    ? fillRuleExpressionTemplate(reasonTemplate, error.details)
    : error.code;
  return fillRuleExpressionTemplate(messages.rule_invalid, { reason });
}

function normalizeRuleKeyword(input: string) {
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

function getRuleFieldMap() {
  if (ruleFieldMapCache) {
    return ruleFieldMapCache;
  }

  const attributeValueMap: Record<string, number> = {};
  addAliases(attributeValueMap, ATTRIBUTE_MAP.earth, ['earth', '地']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.water, ['water', '水']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.fire, ['fire', '炎', '火']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.wind, ['wind', '风']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.light, ['light', '光']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.dark, ['dark', '暗']);
  addAliases(attributeValueMap, ATTRIBUTE_MAP.divine, ['divine', '神']);
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
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.downleft, ['downleft', 'bottomleft', '左下', '↙']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.down, ['down', 'bottom', '下', '↓']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.downright, ['downright', 'bottomright', '右下', '↘']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.left, ['left', '左', '←']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.right, ['right', '右', '→']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.upleft, ['upleft', 'topleft', '左上', '↖']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.up, ['up', 'top', '上', '↑']);
  addAliases(linkMarkerValueMap, LINK_MARKER_NAME_TO_BIT.upright, ['upright', 'topright', '右上', '↗']);

  const definitions: RuleFieldDefinition[] = [
    { key: 'id', kind: 'numeric', sql: 'datas.id', aliases: ['id', 'code', 'cardid', '密码', '卡号'] },
    { key: 'alias', kind: 'numeric', sql: 'datas.alias', aliases: ['alias', 'aliasid', '同名卡', '同名卡id', '别名', '别名id'] },
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

function tokenizeRuleExpression(input: string) {
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

export function parseRuleExpression(input: string): string | null {
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
