import generatedSnippets from '$lib/data/lua-intel/snippets.generated.json';
import type { LuaSnippetItem } from '$lib/types';

export const DEFAULT_SCRIPT_SNIPPETS = JSON.stringify(Object.fromEntries(
  generatedSnippets.filter((item) => item.sortText.startsWith('1'))
    .map(({ name, prefix, body, description }) => [name, { prefix, body, description }]),
), null, 2);
export type ScriptSnippetEntry = { name: string; prefix: string; description: string; body: string };
export type SnippetIssue = 'json' | 'entry' | 'name' | 'prefix' | 'body' | 'duplicate';

export const readScriptSnippetEntries = (text: string): ScriptSnippetEntry[] => {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('entry');
  return Object.entries(raw).map(([name, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('entry');
    const item = value as Record<string, unknown>;
    if (typeof item.prefix !== 'string' || (item.description !== undefined && typeof item.description !== 'string')) throw new Error('entry');
    const body = typeof item.body === 'string' ? item.body
      : Array.isArray(item.body) && item.body.every((line) => typeof line === 'string') ? item.body.join('\n') : null;
    if (body === null) throw new Error('body');
    return { name, prefix: item.prefix, description: String(item.description ?? ''), body: body.replace(/\r\n/g, '\n') };
  });
};

export const getScriptSnippetIssue = (text: string): SnippetIssue | null => {
  let entries: ScriptSnippetEntry[];
  try { entries = readScriptSnippetEntries(text); }
  catch (error) { return error instanceof SyntaxError ? 'json' : (error as Error).message as SnippetIssue; }
  const prefixes = new Set<string>();
  for (const entry of entries) {
    if (!entry.name.trim()) return 'name';
    const prefix = entry.prefix.trim();
    if (!prefix || /\s/.test(prefix)) return 'prefix';
    if (!entry.body.trim()) return 'body';
    if (prefixes.has(prefix.toLowerCase())) return 'duplicate';
    prefixes.add(prefix.toLowerCase());
  }
  return null;
};

export const serializeScriptSnippetEntries = (entries: ScriptSnippetEntry[]) => JSON.stringify(
  Object.fromEntries(entries.map(({ name, prefix, description, body }) => [name, {
    prefix, body: body.split(/\r?\n/), description,
  }])), null, 2,
);

let cachedText = '';
let cachedSnippets: LuaSnippetItem[] = [];
export const getConfiguredScriptSnippets = (text = DEFAULT_SCRIPT_SNIPPETS, catalog: LuaSnippetItem[]): LuaSnippetItem[] => {
  if (text !== cachedText) {
    // Settings are validated before save; a damaged payload must not break completion.
    cachedSnippets = getScriptSnippetIssue(text) ? [] : readScriptSnippetEntries(text).map((entry, index) => ({
      ...entry, prefix: entry.prefix.trim(), body: entry.body.split('\n'),
      description: entry.description || entry.name, sortText: `1${String(index + 1).padStart(3, '0')}`,
    }));
    cachedText = text;
  }
  // Generated and external catalogs reserve sort group 0 for built-in snippets.
  return [...cachedSnippets, ...catalog.filter((item) => item.sortText.startsWith('0'))];
};
