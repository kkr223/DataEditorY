import { loadExternalLuaCatalog } from '$lib/utils/luaIntelCatalog';
import type { LuaConstantItem, LuaFunctionItem } from '$lib/types';

export type LuaReferenceManualKind = 'constants' | 'functions';
export type LuaReferenceManualItem = {
  key: string;
  title: string;
  detail: string;
  description: string;
  category: string;
  valueText: string;
  insertText: string;
  insertAsSnippet: boolean;
  searchText: string;
};

const LUA_KEYWORDS = [
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
] as const;

type LuaCatalog = {
  constants: LuaConstantItem[];
  functions: LuaFunctionItem[];
  snippets: Array<{ name: string; prefix: string; body: string[]; description: string; sortText: string }>;
  keywords: string[];
};

let catalogPromise: Promise<LuaCatalog> | null = null;
const referenceManualItemPromises = new Map<LuaReferenceManualKind, Promise<LuaReferenceManualItem[]>>();

function normalizeCompletionHint(text: string, fallback = '') {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return fallback.trim() || null;
  }

  return lines.join('\n');
}

function toSignatureLabel(item: LuaFunctionItem) {
  return `${item.returnType} ${item.signature}`;
}

function stripParameterName(parameter: string) {
  const normalized = parameter.trim();
  if (!normalized) return normalized;
  const parts = normalized.split(/\s+/);
  return parts.at(-1)?.replace(/\?$/, '') || normalized;
}

function escapeSnippetPlaceholder(value: string) {
  return value.replace(/[$}\\]/g, '\\$&');
}

function buildFunctionInsertText(displayName: string, item: LuaFunctionItem) {
  const parameters = item.parameters.map(stripParameterName).filter(Boolean);
  if (parameters.length === 0) {
    return `${displayName}()`;
  }

  const placeholder = parameters
    .map((parameter, index) => `\${${index + 1}:${escapeSnippetPlaceholder(parameter)}}`)
    .join(', ');
  return `${displayName}(${placeholder})`;
}

function buildReferenceSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function buildConstantReferenceManualItem(item: LuaConstantItem): LuaReferenceManualItem {
  const category = item.category?.trim() || 'General';
  const description = normalizeCompletionHint(item.description, `${item.name} = ${item.value}`) ?? '';
  return {
    key: `constant:${item.name}`,
    title: item.name,
    detail: `${item.name} = ${item.value}`,
    description,
    category,
    valueText: item.value,
    insertText: item.name,
    insertAsSnippet: false,
    searchText: buildReferenceSearchText([
      item.name,
      item.value,
      item.description,
      category,
    ]),
  };
}

function buildFunctionReferenceManualItem(item: LuaFunctionItem): LuaReferenceManualItem {
  const category = item.category?.trim() || item.namespace || 'General';
  const description = normalizeCompletionHint(item.description, item.signature) ?? '';
  return {
    key: `function:${item.name}`,
    title: item.name,
    detail: toSignatureLabel(item),
    description,
    category,
    valueText: '',
    insertText: buildFunctionInsertText(item.name, item),
    insertAsSnippet: true,
    searchText: buildReferenceSearchText([
      item.name,
      item.shortName,
      item.signature,
      item.returnType,
      item.description,
      category,
    ]),
  };
}

async function loadLuaCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const [constantsModule, functionsModule, snippetsModule] = await Promise.all([
        import('$lib/data/lua-intel/constants.generated.json'),
        import('$lib/data/lua-intel/functions.generated.json'),
        import('$lib/data/lua-intel/snippets.generated.json'),
      ]);

      let catalog: LuaCatalog = {
        constants: constantsModule.default,
        functions: functionsModule.default,
        snippets: snippetsModule.default,
        keywords: [...LUA_KEYWORDS],
      };

      const externalCatalog = await loadExternalLuaCatalog();
      if (externalCatalog) {
        catalog = externalCatalog;
      }

      return catalog;
    })();
  }

  return catalogPromise;
}

export async function loadReferenceManualItems(kind: LuaReferenceManualKind) {
  if (!referenceManualItemPromises.has(kind)) {
    referenceManualItemPromises.set(kind, (async () => {
      const catalog = await loadLuaCatalog();
      return kind === 'constants'
        ? catalog.constants.map(buildConstantReferenceManualItem)
        : catalog.functions.map(buildFunctionReferenceManualItem);
    })());
  }

  return referenceManualItemPromises.get(kind)!;
}
