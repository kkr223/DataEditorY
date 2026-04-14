import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const resourcesDir = resolve(workspaceRoot, 'static', 'resources');
const outputDir = resolve(workspaceRoot, 'src', 'lib', 'data', 'lua-intel');

/**
 * @param {string} raw
 */
function normalizeLine(raw) {
  return raw.replace(/\r/g, '');
}

/**
 * @param {string} line
 */
function parseConstantCategory(line) {
  const decoratedCategoryMatch = line.match(/^--+\s*=+\s*(.+?)\s*=+\s*(?:--.*)?$/);
  if (decoratedCategoryMatch) {
    return decoratedCategoryMatch[1].trim();
  }

  const plainCategoryMatch = line.match(/^--+\s*(.+?)\s*$/);
  if (!plainCategoryMatch) {
    return null;
  }

  const nextCategory = plainCategoryMatch[1]
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return nextCategory || null;
}

/**
 * @param {string} text
 */
function parseConstants(text) {
  /** @type {Array<{name:string;value:string;description:string;category:string}>} */
  const items = [];
  let currentCategory = 'General';

  for (const rawLine of text.split('\n')) {
    const line = normalizeLine(rawLine).trim();
    if (!line) continue;

    if (line.startsWith('--')) {
      const nextCategory = parseConstantCategory(line);
      if (nextCategory) {
        currentCategory = nextCategory;
      }
      continue;
    }

    const match = line.match(/^([A-Z0-9_]+)\s*=\s*([^\s].*?)(?:\s*--\s*(.*))?$/);
    if (!match) continue;

    items.push({
      name: match[1],
      value: match[2].trim(),
      description: (match[3] ?? '').trim(),
      category: currentCategory,
    });
  }

  return items;
}

/**
 * @param {string} parameterBlock
 */
function splitParameters(parameterBlock) {
  const normalized = parameterBlock.trim();
  if (!normalized) return [];

  /** @type {string[]} */
  const parts = [];
  let current = '';
  let bracketDepth = 0;

  for (const char of normalized) {
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === ',' && bracketDepth === 0) {
      const next = current.trim();
      if (next) parts.push(next);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * @param {string} text
 */
function parseFunctions(text) {
  const lines = text.split('\n').map(normalizeLine);
  /** @type {Array<{name:string;namespace:string;shortName:string;signature:string;returnType:string;parameters:string[];description:string;raw:string}>} */
  const items = [];
  let currentCategory = 'General';
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index].trim();
    if (!rawLine) {
      index += 1;
      continue;
    }

    if (rawLine.startsWith('==========')) {
      const category = rawLine.replace(/=+/g, '').trim();
      if (category) {
        currentCategory = category;
      }
      index += 1;
      continue;
    }

    if (!rawLine.startsWith('●')) {
      index += 1;
      continue;
    }

    const rawSignature = rawLine.slice(1).trim();
    const signatureMatch = rawSignature.match(/^(.+?)\s+([A-Za-z_][\w.]*)\s*\((.*)\)$/);
    if (!signatureMatch) {
      index += 1;
      continue;
    }

    const descriptionLines = [];
    index += 1;
    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (candidate.startsWith('●') || candidate.startsWith('==========')) {
        break;
      }
      if (candidate) {
        descriptionLines.push(candidate);
      }
      index += 1;
    }

    const name = signatureMatch[2];
    const namespace = name.includes('.') ? name.split('.')[0] : 'global';
    const shortName = name.includes('.') ? name.split('.').at(-1) ?? name : name;

    items.push({
      name,
      namespace,
      shortName,
      signature: `${name}(${signatureMatch[3]})`,
      returnType: signatureMatch[1].trim(),
      parameters: splitParameters(signatureMatch[3]),
      description: descriptionLines.join('\n').trim(),
      raw: rawSignature,
      category: currentCategory,
    });
  }

  return items;
}

/**
 * @param {string} text
 */
function parseTypedDefinitions(text) {
  const lines = text.split('\n').map(normalizeLine);
  /** @type {import('../src/lib/types').LuaFunctionItem[]} */
  const items = [];
  /** @type {string[]} */
  let descriptionLines = [];
  /** @type {Map<string, { type: string; optional: boolean }>} */
  let parameterTypes = new Map();
  /** @type {string[]} */
  let returnTypes = [];

  function resetPendingAnnotations() {
    descriptionLines = [];
    parameterTypes = new Map();
    returnTypes = [];
  }

  /**
   * @param {string} typeText
   */
  function normalizeAnnotatedType(typeText) {
    return typeText.replace(/\s+default:\s+.+$/, '').trim();
  }

  /**
   * @param {string} parameterName
   */
  function getDisplayParameterName(parameterName) {
    if (parameterName === '...') {
      return parameterName;
    }

    const annotation = parameterTypes.get(parameterName);
    return annotation?.optional ? `${parameterName}?` : parameterName;
  }

  /**
   * @param {string} name
   * @param {string[]} parameterNames
   */
  function flushTypedFunction(name, parameterNames) {
    const namespace = name.includes('.') ? name.split('.')[0] : 'global';
    const shortName = name.includes('.') ? name.split('.').at(-1) ?? name : name;
    const parameters = parameterNames.map((parameterName) => {
      const annotation = parameterTypes.get(parameterName);
      const type = annotation?.type ?? 'any';
      return `${type} ${getDisplayParameterName(parameterName)}`;
    });
    const signatureParameters = parameterNames.map((parameterName) => getDisplayParameterName(parameterName));

    items.push({
      name,
      namespace,
      shortName,
      signature: `${name}(${signatureParameters.join(', ')})`,
      returnType: returnTypes.length > 0 ? returnTypes.join(', ') : 'void',
      parameters,
      description: descriptionLines.join('\n').trim(),
      raw: `function ${name}(${parameterNames.join(', ')}) end`,
      category: 'Typed Definitions',
    });
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      resetPendingAnnotations();
      continue;
    }

    if (trimmed.startsWith('---@param ')) {
      const match = trimmed.match(/^---@param\s+(\.\.\.|[A-Za-z_][\w]*)(\?)?\s+(.+?)(?:\s+#.*)?$/);
      if (match) {
        parameterTypes.set(match[1], {
          type: normalizeAnnotatedType(match[3]),
          optional: Boolean(match[2]),
        });
      }
      continue;
    }

    if (trimmed.startsWith('---@return ')) {
      const match = trimmed.match(/^---@return\s+(.+?)(?:\s+#.*)?$/);
      if (match) {
        returnTypes.push(match[1].trim());
      }
      continue;
    }

    if (trimmed.startsWith('---') && !trimmed.startsWith('---@')) {
      descriptionLines.push(trimmed.replace(/^---\s?/, '').trim());
      continue;
    }

    const functionMatch = trimmed.match(/^function\s+([A-Za-z_][\w.]*)\s*\((.*?)\)\s*end$/);
    if (functionMatch) {
      const parameterNames = functionMatch[2]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      flushTypedFunction(functionMatch[1], parameterNames);
      resetPendingAnnotations();
      continue;
    }

    resetPendingAnnotations();
  }

  return items;
}

/**
 * @param {Array<any>} primary
 * @param {Array<any>} secondary
 */
function mergeFunctions(primary, secondary) {
  const merged = new Map();

  for (const item of secondary) {
    merged.set(item.name, { ...item });
  }

  for (const item of primary) {
    const fallback = merged.get(item.name);
    merged.set(item.name, {
      ...(fallback ?? {}),
      ...item,
      description: item.description || fallback?.description || '',
      category: item.category || fallback?.category,
      raw: item.raw || fallback?.raw || '',
    });
  }

  return Array.from(merged.values());
}

function buildSnippets() {
  return [
    {
      name: 'Script Header',
      prefix: 'ygo.header',
      body: [
        '-- ${1:Card Name}',
        'local s,id=GetID()',
        'function s.initial_effect(c)',
        '\t$0',
        'end',
      ],
      description: 'Create the standard YGOPro script header.',
      sortText: '0001',
    },
    {
      name: 'Ignition Effect',
      prefix: 'ygo.ignition',
      body: [
        'local e1=Effect.CreateEffect(c)',
        'e1:SetDescription(aux.Stringid(id,${1:0}))',
        'e1:SetCategory(${2:CATEGORY_DRAW})',
        'e1:SetType(EFFECT_TYPE_IGNITION)',
        'e1:SetRange(${3:LOCATION_MZONE})',
        'e1:SetCountLimit(1,id)',
        'e1:SetTarget(s.${4:target})',
        'e1:SetOperation(s.${5:operation})',
        'c:RegisterEffect(e1)',
      ],
      description: 'Register a basic ignition effect.',
      sortText: '0002',
    },
    {
      name: 'Trigger Effect',
      prefix: 'ygo.trigger',
      body: [
        'local e1=Effect.CreateEffect(c)',
        'e1:SetDescription(aux.Stringid(id,${1:0}))',
        'e1:SetCategory(${2:CATEGORY_SPECIAL_SUMMON})',
        'e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)',
        'e1:SetProperty(EFFECT_FLAG_DELAY)',
        'e1:SetCode(${3:EVENT_TO_GRAVE})',
        'e1:SetCountLimit(1,id)',
        'e1:SetTarget(s.${4:target})',
        'e1:SetOperation(s.${5:operation})',
        'c:RegisterEffect(e1)',
      ],
      description: 'Register a delayed trigger effect.',
      sortText: '0003',
    },
    {
      name: 'Quick Effect',
      prefix: 'ygo.quick',
      body: [
        'local e1=Effect.CreateEffect(c)',
        'e1:SetDescription(aux.Stringid(id,${1:0}))',
        'e1:SetCategory(${2:CATEGORY_NEGATE})',
        'e1:SetType(EFFECT_TYPE_QUICK_O)',
        'e1:SetCode(${3:EVENT_FREE_CHAIN})',
        'e1:SetRange(${4:LOCATION_MZONE})',
        'e1:SetHintTiming(0,TIMINGS_CHECK_MONSTER)',
        'e1:SetCountLimit(1,id)',
        'e1:SetCondition(s.${5:condition})',
        'e1:SetTarget(s.${6:target})',
        'e1:SetOperation(s.${7:operation})',
        'c:RegisterEffect(e1)',
      ],
      description: 'Register a quick effect with the common options.',
      sortText: '0004',
    },
  ];
}

/**
 * @param {string} text
 */
function parseCustomSnippets(text) {
  /** @type {unknown} */
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }

  return Object.entries(raw).flatMap(([name, value], index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }

    const prefix = typeof value.prefix === 'string' ? value.prefix.trim() : '';
    if (!prefix) {
      return [];
    }

    const body = Array.isArray(value.body)
      ? value.body.map((line) => String(line))
      : typeof value.body === 'string'
        ? value.body.split(/\r?\n/)
        : [];

    if (body.length === 0) {
      return [];
    }

    const description = typeof value.description === 'string' ? value.description.trim() : '';

    return [{
      name,
      prefix,
      body,
      description: description || name,
      sortText: `1${String(index + 1).padStart(3, '0')}`,
    }];
  });
}

const constants = parseConstants(readFileSync(resolve(resourcesDir, 'constant.lua'), 'utf8'));
const functions = mergeFunctions(
  parseTypedDefinitions(readFileSync(resolve(resourcesDir, 'def.lua'), 'utf8')),
  parseFunctions(readFileSync(resolve(resourcesDir, '_functions.txt'), 'utf8')),
);
const snippets = [
  ...parseCustomSnippets(readFileSync(resolve(resourcesDir, 'snippets.json'), 'utf8')),
  ...buildSnippets(),
];
const keywords = [
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
];

mkdirSync(outputDir, { recursive: true });
writeFileSync(resolve(outputDir, 'constants.generated.json'), `${JSON.stringify(constants, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'functions.generated.json'), `${JSON.stringify(functions, null, 2)}\n`);
writeFileSync(resolve(outputDir, 'snippets.generated.json'), `${JSON.stringify(snippets, null, 2)}\n`);
writeFileSync(
  resolve(outputDir, 'catalog.generated.ts'),
  [
    "import constants from './constants.generated.json';",
    "import functions from './functions.generated.json';",
    "import snippets from './snippets.generated.json';",
    "import type { LuaCatalog } from '$lib/types';",
    '',
    `const keywords = ${JSON.stringify(keywords, null, 2)} as const;`,
    '',
    'export const luaCatalog: LuaCatalog = {',
    '  constants,',
    '  functions,',
    '  snippets,',
    '  keywords: [...keywords],',
    '};',
    '',
    'export { constants as luaConstants, functions as luaFunctions, snippets as luaSnippets, keywords as luaKeywords };',
    '',
  ].join('\n'),
);
