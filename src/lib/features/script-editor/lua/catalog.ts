import { host } from '#lib/platform/host/index.ts';
import { readTextFile, resolveResourceFile } from '#lib/native/assetApi.ts';
import { luaCatalog as generatedLuaCatalog } from '#lib/data/lua-intel/catalog.generated.ts';
import bundledFunctionText from '../../../../../static/resources/_functions.txt?raw';
import type { LuaCatalog, LuaConstantItem, LuaFunctionItem, LuaSnippetItem } from '#lib/types/index.ts';

const LUA_INTEL_RESOURCE_DIR = 'lua-intel';

function normalizeLine(raw: string) {
  return raw.replace(/\r/g, '');
}

export function parseConstantCategory(line: string) {
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

export function parseConstants(text: string): LuaConstantItem[] {
  const items: LuaConstantItem[] = [];
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

function splitParameters(parameterBlock: string) {
  const normalized = parameterBlock.trim();
  if (!normalized) return [];

  const parts: string[] = [];
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

function parseFunctions(text: string): LuaFunctionItem[] {
  const lines = text.split('\n').map(normalizeLine);
  const items: LuaFunctionItem[] = [];
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

    const descriptionLines: string[] = [];
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

function parseTypedDefinitions(text: string): LuaFunctionItem[] {
  const lines = text.split('\n').map(normalizeLine);
  const items: LuaFunctionItem[] = [];
  let descriptionLines: string[] = [];
  let parameterTypes = new Map<string, { type: string; optional: boolean }>();
  let returnTypes: string[] = [];

  function resetPendingAnnotations() {
    descriptionLines = [];
    parameterTypes = new Map<string, { type: string; optional: boolean }>();
    returnTypes = [];
  }

  function normalizeAnnotatedType(typeText: string) {
    return typeText.replace(/\s+default:\s+.+$/, '').trim();
  }

  function getDisplayParameterName(parameterName: string) {
    if (parameterName === '...') {
      return parameterName;
    }

    const annotation = parameterTypes.get(parameterName);
    return annotation?.optional ? `${parameterName}?` : parameterName;
  }

  function flushTypedFunction(name: string, parameterNames: string[]) {
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

function mergeFunctions(primary: LuaFunctionItem[], secondary: LuaFunctionItem[]) {
  const merged = new Map<string, LuaFunctionItem>();

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

function buildBuiltinSnippets(): LuaSnippetItem[] {
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

function buildLuaCatalog(source: {
  constants: string | null;
  typedDefinitions: string | null;
  functions: string | null;
}): LuaCatalog {
  const manualFunctions = parseFunctions(source.functions ?? bundledFunctionText);
  const functions = mergeFunctions(
    source.typedDefinitions === null
      ? generatedLuaCatalog.functions
      : parseTypedDefinitions(source.typedDefinitions),
    manualFunctions,
  );
  const functionsByName = new Map(functions.map((item) => [item.name, item]));
  const bundledFunctions = new Map(parseFunctions(bundledFunctionText).map((item) => [item.name, item]));

  for (const item of new Map(manualFunctions.map((item) => [item.name, item])).values()) {
    const bundled = bundledFunctions.get(item.name);
    if (bundled?.raw === item.raw && bundled.description === item.description && bundled.category === item.category) continue;

    // Keep richer annotations for unchanged signatures, while honoring installed edits.
    const annotated = bundled?.raw === item.raw ? functionsByName.get(item.name) : undefined;
    functionsByName.set(item.name, { ...(annotated ?? item), description: item.description, category: item.category });
  }

  return {
    constants: source.constants === null ? generatedLuaCatalog.constants : parseConstants(source.constants),
    functions: Array.from(functionsByName.values()),
    snippets: buildBuiltinSnippets(),
    keywords: [...generatedLuaCatalog.keywords],
  };
}

async function readLuaIntelResource(filename: string) {
  // Prefer installed resources, with flat source/legacy directories as a fallback.
  for (const relativePath of [`${LUA_INTEL_RESOURCE_DIR}/${filename}`, filename]) {
    try {
      const absolutePath = await resolveResourceFile(relativePath);
      return await readTextFile(absolutePath);
    } catch {
      // Try the next location on resolution AND read failure.
    }
  }
  return null;
}

export async function loadExternalLuaCatalog() {
  if (host.kind !== 'tauri') {
    return null;
  }

  const [constants, typedDefinitions, functions] = await Promise.all([
    readLuaIntelResource('constant.lua'),
    readLuaIntelResource('def.lua'),
    readLuaIntelResource('_functions.txt'),
  ]);

  if (constants === null && typedDefinitions === null && functions === null) return null;
  return buildLuaCatalog({ constants, typedDefinitions, functions });
}

let runtimeCatalog: LuaCatalog = generatedLuaCatalog;
let runtimeSource = '';
let runtimeLoad: Promise<LuaCatalog> | null = null;
let lastResourceCheck = -Infinity;

/** Recheck on demand, sharing concurrent requests and preserving semantic caches if unchanged. */
export function loadLuaCatalog(refresh = false): Promise<LuaCatalog> {
  if (runtimeLoad) return runtimeLoad;
  if (!refresh && Date.now() - lastResourceCheck < 1000) return Promise.resolve(runtimeCatalog);
  runtimeLoad = (async () => {
    const catalog = await loadExternalLuaCatalog() ?? generatedLuaCatalog;
    const source = JSON.stringify(catalog);
    if (source !== runtimeSource) {
      runtimeCatalog = catalog;
      runtimeSource = source;
    }
    lastResourceCheck = Date.now();
    return runtimeCatalog;
  })().finally(() => { runtimeLoad = null; });
  return runtimeLoad;
}
