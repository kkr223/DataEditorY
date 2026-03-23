import * as luaparse from 'luaparse';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import { SnippetController2 } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { luaCatalog as defaultLuaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { loadExternalLuaCatalog } from '$lib/utils/luaIntelCatalog';
import type { CardDataEntry, LuaFunctionItem } from '$lib/types';

type LuaModelContext = {
  cardCode: number;
  cardName: string;
  strings: string[];
  card: CardDataEntry | null;
};

const LUA_MARKER_OWNER = 'dataeditory-lua';
const modelContexts = new Map<string, LuaModelContext>();
const METHOD_NAMESPACES = new Set(['Card', 'Effect', 'Group']);
let luaCatalog = defaultLuaCatalog;
let functionsByName = new Map<string, LuaFunctionItem>();
let functionsByNamespace = new Map<string, LuaFunctionItem[]>();
let functionsByShortName = new Map<string, LuaFunctionItem[]>();
let constantDescriptionsByName = new Map<string, string>();

let providersRegistered = false;
let catalogLoadPromise: Promise<void> | null = null;

function rebuildCatalogIndexes() {
  functionsByName = new Map(luaCatalog.functions.map((item) => [item.name, item]));
  functionsByNamespace = new Map<string, LuaFunctionItem[]>();
  functionsByShortName = new Map<string, LuaFunctionItem[]>();
  constantDescriptionsByName = new Map(luaCatalog.constants.map((item) => [item.name, item.description || item.value]));

  for (const item of luaCatalog.functions) {
    const namespaceItems = functionsByNamespace.get(item.namespace) ?? [];
    namespaceItems.push(item);
    functionsByNamespace.set(item.namespace, namespaceItems);

    const shortNameItems = functionsByShortName.get(item.shortName) ?? [];
    shortNameItems.push(item);
    functionsByShortName.set(item.shortName, shortNameItems);
  }
}

async function ensureLuaCatalogLoaded() {
  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const externalCatalog = await loadExternalLuaCatalog();
      if (externalCatalog) {
        luaCatalog = externalCatalog;
      }
      rebuildCatalogIndexes();
    })();
  }

  await catalogLoadPromise;
}

rebuildCatalogIndexes();

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (workerId: string, label: string) => Worker;
    };
  }
}

function ensureMonacoEnvironment() {
  if (typeof window === 'undefined') return;
  if (window.MonacoEnvironment?.getWorker) return;

  window.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

function getCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function defineThemes() {
  monaco.editor.defineTheme('dataeditory-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '7f8ea3' },
      { token: 'keyword', foreground: '60a5fa', fontStyle: 'bold' },
      { token: 'string', foreground: '86efac' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'delimiter', foreground: 'cbd5e1' },
      { token: 'identifier', foreground: 'f8fafc' },
    ],
    colors: {
      'editor.background': '#1c2422',
      'editor.foreground': getCssVar('--text-primary') || '#f5f8ff',
      'editor.lineHighlightBackground': 'rgba(110, 168, 140, 0.08)',
      'editorLineNumber.foreground': '#6f857d',
      'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#f5f8ff',
      'editorCursor.foreground': getCssVar('--accent-primary') || '#3b82f6',
      'editor.selectionBackground': 'rgba(82, 156, 111, 0.22)',
      'editor.inactiveSelectionBackground': 'rgba(82, 156, 111, 0.14)',
      'editorWidget.background': '#202a27',
      'editorWidget.border': '#364741',
      'editorSuggestWidget.background': '#202a27',
      'editorSuggestWidget.border': '#364741',
      'editorHoverWidget.background': '#202a27',
      'editorHoverWidget.border': '#364741',
      'editorError.foreground': '#d89a96',
      'editorError.border': '#00000000',
      'editorError.background': 'rgba(216, 154, 150, 0.12)',
      'editorWarning.foreground': '#d3bf8a',
      'editorWarning.border': '#00000000',
      'editorWarning.background': 'rgba(211, 191, 138, 0.1)',
      'editorInfo.foreground': '#89b8c9',
      'editorInfo.border': '#00000000',
      'editorInfo.background': 'rgba(137, 184, 201, 0.08)',
    },
  });

  monaco.editor.defineTheme('dataeditory-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '64748b' },
      { token: 'keyword', foreground: '2563eb', fontStyle: 'bold' },
      { token: 'string', foreground: '15803d' },
      { token: 'number', foreground: 'b45309' },
      { token: 'delimiter', foreground: '1f2937' },
      { token: 'identifier', foreground: '111827' },
    ],
    colors: {
      'editor.background': '#f4f8f3',
      'editor.foreground': getCssVar('--text-primary') || '#152033',
      'editor.lineHighlightBackground': 'rgba(76, 140, 96, 0.06)',
      'editorLineNumber.foreground': '#8aa08e',
      'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#152033',
      'editorCursor.foreground': getCssVar('--accent-primary') || '#2563eb',
      'editor.selectionBackground': 'rgba(76, 140, 96, 0.16)',
      'editor.inactiveSelectionBackground': 'rgba(76, 140, 96, 0.1)',
      'editorWidget.background': '#f8fcf6',
      'editorWidget.border': '#c9d9cb',
      'editorSuggestWidget.background': '#f8fcf6',
      'editorSuggestWidget.border': '#c9d9cb',
      'editorHoverWidget.background': '#f8fcf6',
      'editorHoverWidget.border': '#c9d9cb',
      'editorError.foreground': '#c8746b',
      'editorError.border': '#00000000',
      'editorError.background': 'rgba(200, 116, 107, 0.1)',
      'editorWarning.foreground': '#b08a39',
      'editorWarning.border': '#00000000',
      'editorWarning.background': 'rgba(176, 138, 57, 0.08)',
      'editorInfo.foreground': '#4d87a0',
      'editorInfo.border': '#00000000',
      'editorInfo.background': 'rgba(77, 135, 160, 0.06)',
    },
  });
}

export function syncMonacoTheme() {
  defineThemes();
  const theme = document.documentElement.getAttribute('data-theme') === 'light'
    ? 'dataeditory-light'
    : 'dataeditory-dark';
  monaco.editor.setTheme(theme);
}

function toMarkdownParagraphs(lines: string[]) {
  return lines.filter(Boolean).join('\n\n');
}

function toSignatureLabel(item: LuaFunctionItem) {
  return `${item.returnType} ${item.signature}`;
}

function getParameterHints(item: LuaFunctionItem) {
  return item.parameters.length > 0 ? item.parameters : [''];
}

function stripParameterName(parameter: string) {
  return parameter
    .replace(/[\[\]]/g, '')
    .split('=')
    .at(0)
    ?.trim()
    .split(/\s+/)
    .at(-1)
    ?.replace(/\W+/g, '') || 'arg';
}

function buildFunctionInsertText(
  displayName: string,
  item: LuaFunctionItem,
  options: {
    omitFirstParameter?: boolean;
  } = {},
) {
  const parameters = options.omitFirstParameter ? item.parameters.slice(1) : item.parameters;

  if (parameters.length === 0 || (parameters.length === 1 && parameters[0] === '')) {
    return `${displayName}()`;
  }

  const placeholder = parameters.map((parameter) => stripParameterName(parameter)).join(', ');
  return `${displayName}(${placeholder})`;
}

function getFullTokenAtPosition(model: monaco.editor.ITextModel, position: monaco.Position) {
  const line = model.getLineContent(position.lineNumber);
  let start = position.column - 1;
  let end = position.column - 1;

  while (start > 0 && /[\w.]/.test(line[start - 1] ?? '')) {
    start -= 1;
  }
  while (end < line.length && /[\w.]/.test(line[end] ?? '')) {
    end += 1;
  }

  return {
    text: line.slice(start, end),
    startColumn: start + 1,
    endColumn: end + 1,
  };
}

function getPrimaryReturnType(item: LuaFunctionItem) {
  const primary = item.returnType
    .split(/[|,\[]/, 1)[0]
    ?.trim();
  return primary || null;
}

function inferReceiverNamespace(model: monaco.editor.ITextModel, receiverName: string, lineNumber: number) {
  const escapedReceiver = receiverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignmentPattern = new RegExp(
    `(?:local\\s+)?(?:[A-Za-z_][\\w]*\\s*,\\s*)*${escapedReceiver}\\s*(?:,\\s*[A-Za-z_][\\w]*)*\\s*=\\s*([A-Za-z_][\\w.]*)\\s*\\(`,
    'g',
  );

  for (let currentLine = lineNumber; currentLine >= 1; currentLine -= 1) {
    const line = model.getLineContent(currentLine);
    const matches = Array.from(line.matchAll(assignmentPattern));
    const functionName = matches.at(-1)?.[1];
    if (!functionName) continue;

    const functionItem = getFunctionForCall(functionName);
    const returnType = functionItem ? getPrimaryReturnType(functionItem) : null;
    if (returnType && METHOD_NAMESPACES.has(returnType)) {
      return returnType;
    }
  }

  return null;
}

function getNamespaceCompletionContext(model: monaco.editor.ITextModel, position: monaco.Position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const namespaceMatch = linePrefix.match(/([A-Za-z_][\w]*)\.\s*([A-Za-z_]*)$/);
  if (namespaceMatch) {
    return {
      kind: 'namespace' as const,
      namespace: namespaceMatch[1],
      partial: namespaceMatch[2] ?? '',
    };
  }

  const methodMatch = linePrefix.match(/([A-Za-z_][\w]*)\:\s*([A-Za-z_]*)$/);
  if (!methodMatch) return null;

  return {
    kind: 'method' as const,
    receiver: methodMatch[1],
    namespace: inferReceiverNamespace(model, methodMatch[1], position.lineNumber),
    partial: methodMatch[2] ?? '',
  };
}

function buildFunctionDocumentation(item: LuaFunctionItem) {
  return toMarkdownParagraphs([
    `**${item.name}**`,
    `\`${toSignatureLabel(item)}\``,
    item.description,
  ]);
}

function getInlineDescription(text: string, fallback = '') {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? fallback;

  if (!firstLine) return undefined;
  return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
}

function normalizeCompletionHint(text: string, fallback = '') {
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  const hint = normalized || fallback;
  if (!hint) return null;
  return hint.length > 520 ? `${hint.slice(0, 520)}...` : hint;
}

function buildConstantDocumentation(name: string, value: string, description: string) {
  return toMarkdownParagraphs([
    `**${name}**`,
    `\`${name} = ${value}\``,
    description,
  ]);
}

function getFunctionForCall(name: string) {
  if (functionsByName.has(name)) {
    return functionsByName.get(name) ?? null;
  }

  const byShortName = functionsByShortName.get(name) ?? [];
  return byShortName.length === 1 ? byShortName[0] : null;
}

function getStringHint(context: LuaModelContext | undefined, index: number) {
  if (!context) return null;
  const text = context.strings[index] ?? '';
  return text.trim() ? text : null;
}

function getSnippetCompletionContext(model: monaco.editor.ITextModel, position: monaco.Position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const match = linePrefix.match(/(#[_A-Za-z0-9]*)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    startColumn: position.column - match[1].length,
    endColumn: position.column,
  };
}

function provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
  const word = model.getWordUntilPosition(position);
  const snippetContext = getSnippetCompletionContext(model, position);
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const namespaceContext = getNamespaceCompletionContext(model, position);
  const currentWord = word.word.toLowerCase();
  const suggestions: monaco.languages.CompletionItem[] = [];

  for (const snippet of luaCatalog.snippets) {
    if (namespaceContext) break;
    const snippetRange = snippetContext
      ? new monaco.Range(position.lineNumber, snippetContext.startColumn, position.lineNumber, snippetContext.endColumn)
      : range;
    const snippetFilter = snippetContext ? snippetContext.prefix.toLowerCase() : currentWord;

    if (snippetFilter && !snippet.prefix.toLowerCase().includes(snippetFilter) && !snippet.name.toLowerCase().includes(snippetFilter)) {
      continue;
    }

    suggestions.push({
      label: snippet.prefix,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: snippet.body.join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: snippet.description,
      sortText: snippet.sortText,
      range: snippetRange,
    });
  }

  if (!namespaceContext) {
    for (const keyword of luaCatalog.keywords) {
      if (currentWord && !keyword.startsWith(currentWord)) continue;
      suggestions.push({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        sortText: `1000-${keyword}`,
        range,
      });
    }
  }

  const functions = namespaceContext
    ? namespaceContext.kind === 'namespace'
      ? functionsByNamespace.get(namespaceContext.namespace) ?? []
      : namespaceContext.namespace
        ? functionsByNamespace.get(namespaceContext.namespace) ?? []
        : Array.from(METHOD_NAMESPACES).flatMap((namespace) => functionsByNamespace.get(namespace) ?? [])
    : currentWord
      ? luaCatalog.functions
      : [];

  for (const item of functions) {
    const displayName = namespaceContext ? item.shortName : item.name;
    const filterTarget = namespaceContext ? namespaceContext.partial.toLowerCase() : currentWord;
    if (filterTarget && !displayName.toLowerCase().includes(filterTarget) && !item.name.toLowerCase().includes(filterTarget)) {
      continue;
    }

    if (namespaceContext?.kind === 'method' && namespaceContext.namespace && item.namespace !== namespaceContext.namespace) {
      continue;
    }

    suggestions.push({
      label: {
        label: displayName,
        description: getInlineDescription(item.description, item.signature),
      },
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: buildFunctionInsertText(displayName, item, {
        omitFirstParameter: namespaceContext?.kind === 'method',
      }),
      detail: toSignatureLabel(item),
      documentation: buildFunctionDocumentation(item),
      sortText: `2000-${displayName}`,
      range,
    });
  }

  if (!namespaceContext && currentWord) {
    for (const item of luaCatalog.constants) {
      if (!item.name.toLowerCase().includes(currentWord)) continue;
      suggestions.push({
        label: {
          label: item.name,
          description: getInlineDescription(item.description, item.value),
        },
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: item.name,
        detail: item.value,
        documentation: buildConstantDocumentation(item.name, item.value, item.description),
        sortText: `3000-${item.name}`,
        range,
      });
    }
  }

  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const stringIdMatch = linePrefix.match(/aux\.Stringid\s*\(\s*id\s*,\s*(\d*)$/);
  if (stringIdMatch) {
    const context = modelContexts.get(model.uri.toString());
    for (let index = 0; index < Math.max(context?.strings.length ?? 0, 16); index += 1) {
      suggestions.push({
        label: String(index),
        kind: monaco.languages.CompletionItemKind.Value,
        insertText: String(index),
        detail: context?.strings[index] || `str${index + 1}`,
        documentation: context?.strings[index] || `str${index + 1} is empty`,
        sortText: `0000-${index.toString().padStart(2, '0')}`,
        range,
      });
    }
  }

  return { suggestions };
}

function provideHover(model: monaco.editor.ITextModel, position: monaco.Position) {
  const token = getFullTokenAtPosition(model, position);
  if (!token.text) return null;

  const constant = luaCatalog.constants.find((item) => item.name === token.text);
  if (constant) {
    return {
      range: new monaco.Range(position.lineNumber, token.startColumn, position.lineNumber, token.endColumn),
      contents: [{ value: buildConstantDocumentation(constant.name, constant.value, constant.description) }],
    };
  }

  const item = getFunctionForCall(token.text);
  if (item) {
    return {
      range: new monaco.Range(position.lineNumber, token.startColumn, position.lineNumber, token.endColumn),
      contents: [{ value: buildFunctionDocumentation(item) }],
    };
  }

  const line = model.getLineContent(position.lineNumber);
  for (const match of line.matchAll(/aux\.Stringid\s*\(\s*id\s*,\s*(\d+)\s*\)/g)) {
    const startIndex = match.index ?? -1;
    if (startIndex === -1) continue;
    const endIndex = startIndex + match[0].length;
    if (position.column - 1 < startIndex || position.column - 1 > endIndex) continue;

    const context = modelContexts.get(model.uri.toString());
    const stringIndex = Number(match[1]);
    const hint = getStringHint(context, stringIndex);
    if (!hint) return null;

    return {
      range: new monaco.Range(position.lineNumber, startIndex + 1, position.lineNumber, endIndex + 1),
      contents: [
        {
          value: toMarkdownParagraphs([
            `**aux.Stringid(id, ${stringIndex})**`,
            `当前文本: ${hint}`,
          ]),
        },
      ],
    };
  }

  return null;
}

function provideSignatureHelp(model: monaco.editor.ITextModel, position: monaco.Position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const match = linePrefix.match(/([A-Za-z_][\w.:]*)\s*\(([^()]*)$/);
  if (!match) return null;

  const methodMatch = match[1].match(/^([A-Za-z_][\w]*)\:(\w+)$/);
  const item = methodMatch
    ? (() => {
        const inferredNamespace = inferReceiverNamespace(model, methodMatch[1], position.lineNumber);
        if (inferredNamespace) {
          return (functionsByNamespace.get(inferredNamespace) ?? []).find((candidate) => candidate.shortName === methodMatch[2]) ?? null;
        }
        return getFunctionForCall(methodMatch[2]);
      })()
    : getFunctionForCall(match[1]);
  if (!item) return null;

  const activeParameter = Math.max(0, match[2].split(',').length - 1);
  const parameters = methodMatch ? getParameterHints(item).slice(1) : getParameterHints(item);

  return {
    value: {
      signatures: [
        {
          label: toSignatureLabel(item),
          documentation: item.description,
          parameters: parameters.map((parameter) => ({
            label: parameter,
          })),
        },
      ],
      activeSignature: 0,
      activeParameter: Math.min(activeParameter, Math.max(0, parameters.length - 1)),
    },
    dispose() {},
  };
}

function registerProviders() {
  if (providersRegistered) return;

  monaco.languages.registerCompletionItemProvider('lua', {
    triggerCharacters: ['.', ':', '(', '#'],
    provideCompletionItems,
  });

  monaco.languages.registerHoverProvider('lua', {
    provideHover,
  });

  monaco.languages.registerSignatureHelpProvider('lua', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp,
  });

  providersRegistered = true;
}

export async function loadMonaco() {
  await ensureLuaCatalogLoaded();
  ensureMonacoEnvironment();
  registerProviders();
  syncMonacoTheme();
  return monaco;
}

export function createScriptModelUri(tabId: string) {
  return monaco.Uri.parse(`inmemory://dataeditory/script-${tabId}.lua`);
}

export function setModelContext(model: monaco.editor.ITextModel, context: LuaModelContext) {
  modelContexts.set(model.uri.toString(), context);
}

export function clearModelContext(model: monaco.editor.ITextModel) {
  modelContexts.delete(model.uri.toString());
}

export function lookupCompletionDescription(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;

  if (functionsByName.has(trimmed)) {
    return normalizeCompletionHint(functionsByName.get(trimmed)?.description ?? '', functionsByName.get(trimmed)?.signature ?? '');
  }

  const shortNameMatches = functionsByShortName.get(trimmed) ?? [];
  if (shortNameMatches.length === 1) {
    return normalizeCompletionHint(shortNameMatches[0].description, shortNameMatches[0].signature);
  }

  if (constantDescriptionsByName.has(trimmed)) {
    return normalizeCompletionHint(constantDescriptionsByName.get(trimmed) ?? '');
  }

  return null;
}

export function getToolbarSnippets() {
  return luaCatalog.snippets;
}

export function insertSnippet(
  editor: monaco.editor.IStandaloneCodeEditor,
  snippet: string,
) {
  const controller = SnippetController2.get(editor);
  if (controller) {
    controller.insert(snippet);
    return true;
  }

  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model) {
    return false;
  }

  editor.executeEdits('script-toolbar', [
    {
      range: selection,
      text: snippet,
      forceMoveMarkers: true,
    },
  ]);
  return true;
}

export function validateLuaModel(model: monaco.editor.ITextModel) {
  const source = model.getValue();
  const context = modelContexts.get(model.uri.toString());
  const markers: monaco.editor.IMarkerData[] = [];

  try {
    luaparse.parse(source, {
      comments: false,
      luaVersion: '5.3',
      locations: true,
      ranges: true,
    });
  } catch (error) {
    const err = error as { line?: number; column?: number; message?: string };
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: err.message ?? 'Lua syntax error',
      startLineNumber: err.line ?? 1,
      startColumn: (err.column ?? 0) + 1,
      endLineNumber: err.line ?? 1,
      endColumn: (err.column ?? 0) + 2,
    });

    if ((err.message ?? '').includes("'end' expected")) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: '看起来存在未闭合的 function/end 结构。',
        startLineNumber: model.getLineCount(),
        startColumn: 1,
        endLineNumber: model.getLineCount(),
        endColumn: Math.max(2, model.getLineMaxColumn(model.getLineCount())),
      });
    }
  }

  if (!/local\s+s\s*,\s*id(?:\s*,\s*o)?\s*=\s*GetID\s*\(\s*\)/.test(source)) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: '缺少标准脚本头：local s,id=GetID()',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: Math.max(2, model.getLineMaxColumn(1)),
    });
  }

  if (!/function\s+s\.initial_effect\s*\(\s*c\s*\)/.test(source)) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: '缺少 function s.initial_effect(c)。',
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: Math.max(2, model.getLineMaxColumn(1)),
    });
  }

  for (const match of source.matchAll(/aux\.Stringid\s*\(\s*id\s*,\s*(\d+)\s*\)/g)) {
    const stringIndex = Number(match[1]);
    const startIndex = match.index ?? 0;
    const startPosition = model.getPositionAt(startIndex);
    const endPosition = model.getPositionAt(startIndex + match[0].length);
    const text = getStringHint(context, stringIndex);

    if (!context || stringIndex < 0 || stringIndex >= context.strings.length || !text) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `aux.Stringid(id, ${stringIndex}) 在当前卡片上下文中没有对应文本。`,
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column,
      });
    }
  }

  monaco.editor.setModelMarkers(model, LUA_MARKER_OWNER, markers);
}
