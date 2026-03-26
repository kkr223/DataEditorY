import * as luaparse from 'luaparse';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import { SnippetController2 } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { luaCatalog as defaultLuaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { analyzeLuaScript, ensureLuaDiagnosticsCatalogLoaded } from '$lib/utils/luaScriptDiagnostics';
import { loadExternalLuaCatalog } from '$lib/utils/luaIntelCatalog';
import { collectLuaScriptFunctionSymbols, type LuaScriptFunctionSymbol } from '$lib/utils/luaScriptSymbols';
import type { CardDataEntry, LuaFunctionItem } from '$lib/types';

type LuaModelContext = {
  cardCode: number;
  cardName: string;
  strings: string[];
  card: CardDataEntry | null;
};

type LuaStaticType = string;
type LuaScope = Map<string, LuaStaticType>;
type LuaNode = {
  type?: string;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

const LUA_MARKER_OWNER = 'dataeditory-lua';
const modelContexts = new Map<string, LuaModelContext>();
const METHOD_NAMESPACES = new Set(['Card', 'Effect', 'Group']);
const GLOBAL_NAMESPACES = new Set(['Card', 'Effect', 'Group', 'Duel', 'Debug']);
const COMMON_PARAM_TYPE_MAP: Record<string, LuaStaticType> = {
  c: 'Card',
  chkc: 'Card',
  tc: 'Card',
  sc: 'Card',
  fc: 'Card',
  rc: 'Card',
  mc: 'Card',
  xc: 'Card',
  dc: 'Card',
  pc: 'Card',
  gc: 'Card',
  bc: 'Card',
  cc: 'Card',
  ac: 'Card',
  e: 'Effect',
  re: 'Effect',
  te: 'Effect',
  ce: 'Effect',
  g: 'Group',
  eg: 'Group',
  sg: 'Group',
  mg: 'Group',
  pg: 'Group',
  dg: 'Group',
  rg: 'Group',
  fg: 'Group',
  og: 'Group',
  vg: 'Group',
};
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
      { token: 'keyword', foreground: 'd7a95b', fontStyle: 'bold' },
      { token: 'string', foreground: '86efac' },
      { token: 'number', foreground: 'fbbf24' },
      { token: 'delimiter', foreground: 'cbd5e1' },
      { token: 'identifier', foreground: 'f8fafc' },
    ],
    colors: {
      'editor.background': '#121714',
      'editor.foreground': getCssVar('--text-primary') || '#f5f8ff',
      'editor.lineHighlightBackground': 'rgba(118, 184, 151, 0.12)',
      'editorLineNumber.foreground': '#71877f',
      'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#f5f8ff',
      'editorCursor.foreground': getCssVar('--accent-primary') || '#3b82f6',
      'editor.selectionBackground': 'rgba(87, 166, 121, 0.28)',
      'editor.inactiveSelectionBackground': 'rgba(87, 166, 121, 0.18)',
      'editorWidget.background': '#26312d',
      'editorWidget.border': '#4d6159',
      'editorSuggestWidget.background': '#26312d',
      'editorSuggestWidget.border': '#4d6159',
      'editorSuggestWidget.selectedBackground': 'rgba(82, 122, 98, 0.46)',
      'editorSuggestWidget.selectedForeground': '#f2fbf5',
      'editorSuggestWidget.highlightForeground': '#b8f2c4',
      'list.activeSelectionBackground': '#50675b',
      'list.activeSelectionForeground': '#f2fbf5',
      'list.inactiveSelectionBackground': 'rgba(80, 103, 91, 0.5)',
      'list.hoverBackground': 'rgba(80, 103, 91, 0.24)',
      'list.highlightForeground': '#b8f2c4',
      'editorHoverWidget.background': '#26312d',
      'editorHoverWidget.border': '#4d6159',
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
      { token: 'keyword', foreground: '8a4b00', fontStyle: 'bold' },
      { token: 'string', foreground: '15803d' },
      { token: 'number', foreground: 'b45309' },
      { token: 'delimiter', foreground: '1f2937' },
      { token: 'identifier', foreground: '111827' },
    ],
    colors: {
      'editor.background': '#f1f5ec',
      'editor.foreground': getCssVar('--text-primary') || '#152033',
      'editor.lineHighlightBackground': 'rgba(74, 133, 91, 0.1)',
      'editorLineNumber.foreground': '#7f9683',
      'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#152033',
      'editorCursor.foreground': getCssVar('--accent-primary') || '#2563eb',
      'editor.selectionBackground': 'rgba(79, 142, 98, 0.22)',
      'editor.inactiveSelectionBackground': 'rgba(79, 142, 98, 0.14)',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#b5c7b7',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#b5c7b7',
      'editorSuggestWidget.selectedBackground': 'rgba(97, 141, 106, 0.16)',
      'editorSuggestWidget.selectedForeground': '#16311e',
      'editorSuggestWidget.highlightForeground': '#215d2f',
      'list.activeSelectionBackground': '#dbe8dc',
      'list.activeSelectionForeground': '#16311e',
      'list.inactiveSelectionBackground': 'rgba(219, 232, 220, 0.72)',
      'list.hoverBackground': 'rgba(219, 232, 220, 0.42)',
      'list.highlightForeground': '#215d2f',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#b5c7b7',
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

function escapeSnippetPlaceholder(value: string) {
  return value.replace(/[$}\\]/g, '\\$&');
}

function buildFunctionInsertText(
  displayName: string,
  item: LuaFunctionItem,
  options: {
    omitFirstParameter?: boolean;
  } = {},
) {
  const parameters = getInvocationParameters(item, Boolean(options.omitFirstParameter));

  if (parameters.length === 0 || (parameters.length === 1 && parameters[0] === '')) {
    return `${displayName}()`;
  }

  const placeholder = parameters
    .map((parameter, index) => `\${${index + 1}:${escapeSnippetPlaceholder(stripParameterName(parameter))}}`)
    .join(', ');
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

function normalizeStaticType(typeName: string | null | undefined): LuaStaticType | null {
  if (!typeName) return null;

  const candidate = typeName
    .split('|')
    .map((item) => item.trim())
    .find((item) => item && item !== 'nil' && item !== 'any' && item !== 'unknown');

  if (!candidate) return null;

  const normalized = candidate.replace(/[\[\]?]/g, '').trim();
  return normalized || null;
}

function getParameterTokens(parameter: string) {
  return parameter
    .replace(/[\[\]]/g, '')
    .split('=')
    .at(0)
    ?.trim()
    .split(/\s+/)
    .filter(Boolean) ?? [];
}

function getParameterNameToken(parameter: string) {
  const tokens = getParameterTokens(parameter);
  return tokens.at(-1)?.replace(/\?$/, '') ?? '';
}

function getParameterTypeToken(parameter: string) {
  const tokens = getParameterTokens(parameter);
  if (tokens.length <= 1) return '';
  return tokens.slice(0, -1).join(' ').trim();
}

function isMethodReceiverParameter(item: LuaFunctionItem, parameter: string) {
  const normalizedType = normalizeStaticType(getParameterTypeToken(parameter));
  if (normalizedType === item.namespace) {
    return true;
  }

  const name = getParameterNameToken(parameter);
  if (name === 'self') {
    return true;
  }

  if (item.namespace === 'Card' && name === 'c') return true;
  if (item.namespace === 'Effect' && name === 'e') return true;
  if (item.namespace === 'Group' && name === 'g') return true;
  return false;
}

function getInvocationParameters(item: LuaFunctionItem, usesMethodSyntax: boolean) {
  if (!usesMethodSyntax || item.parameters.length === 0) {
    return item.parameters.slice();
  }

  const [firstParameter, ...restParameters] = item.parameters;
  return isMethodReceiverParameter(item, firstParameter) ? restParameters : item.parameters.slice();
}

function splitOptionalParameterBlock(parameterBlock: string) {
  return parameterBlock
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isOptionalParameter(parameter: string) {
  const trimmed = parameter.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return true;
  }

  const nameToken = getParameterNameToken(trimmed);
  return trimmed.includes('|nil') || nameToken.endsWith('?') || /\w+\?$/.test(trimmed);
}

function isKnownNamespace(typeName: LuaStaticType | null | undefined): typeName is LuaStaticType {
  return Boolean(typeName && functionsByNamespace.has(typeName));
}

function getFunctionFromNamespace(namespace: string, memberName: string) {
  return functionsByName.get(`${namespace}.${memberName}`) ?? null;
}

function getFunctionCallInfo(node: LuaNode, scopes: LuaScope[], model?: monaco.editor.ITextModel) {
  if (node.type !== 'CallExpression') return null;

  const base = node.base as LuaNode | undefined;
  if (!base || base.type !== 'MemberExpression') return null;

  const memberIdentifier = base.identifier as LuaNode | undefined;
  const memberName = typeof memberIdentifier?.name === 'string' ? memberIdentifier.name : '';
  if (!memberName) return null;

  const receiver = base.base as LuaNode | undefined;
  let namespace: LuaStaticType | null = inferExpressionType(receiver, scopes, model);

  if (!namespace && receiver?.type === 'Identifier' && model) {
    namespace = inferReceiverNamespace(model, String(receiver.name ?? ''), receiver.loc?.start?.line ?? 1);
  }

  if (!namespace && receiver?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(receiver.name ?? ''))) {
    namespace = String(receiver.name);
  }

  if (!namespace || !isKnownNamespace(namespace)) return null;

  return {
    namespace,
    memberName,
    indexer: base.indexer === ':' ? ':' : '.',
    memberNode: memberIdentifier,
    receiverNode: receiver,
    item: getFunctionFromNamespace(namespace, memberName),
    callNode: node,
  };
}

function inferExpressionType(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  model?: monaco.editor.ITextModel,
): LuaStaticType | null {
  if (!node) return null;

  if (node.type === 'Identifier') {
    const name = String(node.name ?? '');
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scoped = scopes[index].get(name);
      if (scoped) return scoped;
    }
    if (GLOBAL_NAMESPACES.has(name)) {
      return name;
    }
    return null;
  }

  if (node.type === 'CallExpression') {
    const callInfo = getFunctionCallInfo(node, scopes, model);
    if (!callInfo?.item) return null;
    return normalizeStaticType(getPrimaryReturnType(callInfo.item));
  }

  if (node.type === 'MemberExpression') {
    const baseNode = node.base as LuaNode | undefined;
    if (baseNode?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(baseNode.name ?? ''))) {
      return String(baseNode.name);
    }
  }

  return null;
}

function getMarkerRange(node: LuaNode | undefined, model: monaco.editor.ITextModel) {
  const startLineNumber = node?.loc?.start?.line ?? 1;
  const startColumn = (node?.loc?.start?.column ?? 0) + 1;
  const endLineNumber = node?.loc?.end?.line ?? startLineNumber;
  const endColumn = (node?.loc?.end?.column ?? startColumn) + (node?.loc?.end ? 1 : 1);

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: Math.max(startColumn + 1, Math.min(endColumn, model.getLineMaxColumn(endLineNumber))),
  };
}

function pushStaticWarning(markers: monaco.editor.IMarkerData[], model: monaco.editor.ITextModel, node: LuaNode | undefined, message: string) {
  markers.push({
    severity: monaco.MarkerSeverity.Warning,
    message,
    ...getMarkerRange(node, model),
  });
}

function inferFunctionParameterType(functionNode: LuaNode, parameterName: string, index: number): LuaStaticType | null {
  if (parameterName in COMMON_PARAM_TYPE_MAP) {
    return COMMON_PARAM_TYPE_MAP[parameterName] ?? null;
  }

  const identifier = functionNode.identifier as LuaNode | undefined;
  if (identifier?.type === 'MemberExpression') {
    const functionName = String((identifier.identifier as LuaNode | undefined)?.name ?? '');
    if (functionName === 'initial_effect' && index === 0 && parameterName === 'c') {
      return 'Card';
    }
  }

  return null;
}

function getArityExpectation(item: LuaFunctionItem, usesMethodSyntax: boolean) {
  const parameters = getInvocationParameters(item, usesMethodSyntax);
  let maxArgs = 0;
  let minArgs = 0;
  let hasVariadic = false;

  for (const parameter of parameters) {
    const trimmed = parameter.trim();
    if (!trimmed) continue;

    const optionalStart = trimmed.indexOf('[');
    if (optionalStart >= 0 && trimmed.includes(']')) {
      const requiredHead = trimmed.slice(0, optionalStart).trim().replace(/,+$/, '').trim();
      if (requiredHead) {
        minArgs += 1;
        maxArgs += 1;
      }

      const optionalTail = trimmed.slice(optionalStart + 1, trimmed.lastIndexOf(']'));
      for (const optionalParameter of splitOptionalParameterBlock(optionalTail)) {
        if (optionalParameter.includes('...')) {
          hasVariadic = true;
          continue;
        }
        maxArgs += 1;
      }
      continue;
    }

    if (trimmed.includes('...')) {
      hasVariadic = true;
      continue;
    }

    maxArgs += 1;
    if (!isOptionalParameter(trimmed)) {
      minArgs += 1;
    }
  }

  return {
    minArgs,
    maxArgs: hasVariadic ? null : maxArgs,
  };
}

function validateCallExpression(
  node: LuaNode,
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  const callInfo = getFunctionCallInfo(node, scopes, model);
  if (!callInfo) return;

  if (!callInfo.item) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.namespace}.${callInfo.memberName} is not a known API member.`,
    );
    return;
  }

  const argumentCount = Array.isArray(node.arguments) ? node.arguments.length : 0;
  const arity = getArityExpectation(callInfo.item, callInfo.indexer === ':');

  if (arity.minArgs !== null && argumentCount < arity.minArgs) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.item.name} expects ${arity.minArgs} argument(s), got ${argumentCount}.`,
    );
    return;
  }

  if (arity.maxArgs !== null && argumentCount > arity.maxArgs) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.item.name} expects at most ${arity.maxArgs} argument(s), got ${argumentCount}.`,
    );
  }
}

function walkExpression(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  if (!node) return;

  if (node.type === 'CallExpression') {
    validateCallExpression(node, scopes, model, markers);
    walkExpression(node.base as LuaNode | undefined, scopes, model, markers);
    for (const argument of (node.arguments as LuaNode[] | undefined) ?? []) {
      walkExpression(argument, scopes, model, markers);
    }
    return;
  }

  if (node.type === 'MemberExpression') {
    walkExpression(node.base as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    walkExpression(node.left as LuaNode | undefined, scopes, model, markers);
    walkExpression(node.right as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'UnaryExpression') {
    walkExpression(node.argument as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'TableConstructorExpression') {
    for (const field of (node.fields as LuaNode[] | undefined) ?? []) {
      walkExpression((field.value as LuaNode | undefined) ?? field, scopes, model, markers);
    }
  }
}

function walkStatements(
  statements: LuaNode[],
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  for (const statement of statements) {
    if (statement.type === 'LocalStatement' || statement.type === 'AssignmentStatement') {
      const variables = (statement.variables as LuaNode[] | undefined) ?? [];
      const init = (statement.init as LuaNode[] | undefined) ?? [];

      for (const expression of init) {
        walkExpression(expression, scopes, model, markers);
      }

      for (let index = 0; index < variables.length; index += 1) {
        const variable = variables[index];
        if (variable?.type !== 'Identifier') continue;
        const inferred = inferExpressionType(init[index], scopes, model);
        if (inferred) {
          scopes[scopes.length - 1].set(String(variable.name), inferred);
        }
      }
      continue;
    }

    if (statement.type === 'CallStatement') {
      walkExpression(statement.expression as LuaNode | undefined, scopes, model, markers);
      continue;
    }

    if (statement.type === 'ReturnStatement') {
      for (const argument of (statement.arguments as LuaNode[] | undefined) ?? []) {
        walkExpression(argument, scopes, model, markers);
      }
      continue;
    }

    if (statement.type === 'FunctionDeclaration') {
      const localScope: LuaScope = new Map();
      const parameters = (statement.parameters as LuaNode[] | undefined) ?? [];
      parameters.forEach((parameter, index) => {
        if (parameter?.type !== 'Identifier') return;
        const inferredType = inferFunctionParameterType(statement, String(parameter.name), index);
        if (inferredType) {
          localScope.set(String(parameter.name), inferredType);
        }
      });
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, localScope], model, markers);
      continue;
    }

    if (statement.type === 'IfStatement') {
      const clauses = (statement.clauses as LuaNode[] | undefined) ?? [];
      walkExpression((clauses[0]?.condition as LuaNode | undefined) ?? undefined, scopes, model, markers);
      for (const clause of clauses) {
        if ((clause.condition as LuaNode | undefined) && clause !== clauses[0]) {
          walkExpression(clause.condition as LuaNode | undefined, scopes, model, markers);
        }
        walkStatements((clause.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      }
      continue;
    }

    if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement') {
      walkExpression(statement.condition as LuaNode | undefined, scopes, model, markers);
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      continue;
    }

    if (statement.type === 'DoStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      continue;
    }

    if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
    }
  }
}

function validateStaticTypes(ast: LuaNode, model: monaco.editor.ITextModel, markers: monaco.editor.IMarkerData[]) {
  const rootScope: LuaScope = new Map();
  for (const namespace of GLOBAL_NAMESPACES) {
    rootScope.set(namespace, namespace);
  }
  walkStatements((ast.body as LuaNode[] | undefined) ?? [], [rootScope], model, markers);
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

function buildScriptFunctionDocumentation(item: LuaScriptFunctionSymbol) {
  return toMarkdownParagraphs([
    `**${item.name}**`,
    `\`${item.signature}\``,
    '当前脚本中定义的函数。',
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

function getScriptFunctionSymbols(model: monaco.editor.ITextModel) {
  return collectLuaScriptFunctionSymbols(model.getValue());
}

function getScriptFunctionByName(model: monaco.editor.ITextModel, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return getScriptFunctionSymbols(model).find((item) => item.name === trimmed || item.shortName === trimmed) ?? null;
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
  const scriptFunctions = getScriptFunctionSymbols(model).filter((item) => {
    if (namespaceContext) {
      if (namespaceContext.kind === 'namespace') {
        return item.namespace === namespaceContext.namespace;
      }

      return namespaceContext.namespace
        ? item.namespace === namespaceContext.namespace
        : Boolean(item.namespace);
    }

    return currentWord
      ? item.name.toLowerCase().includes(currentWord) || item.shortName.toLowerCase().includes(currentWord)
      : false;
  });

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
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: toSignatureLabel(item),
      documentation: buildFunctionDocumentation(item),
      sortText: `2000-${displayName}`,
      range,
    });
  }

  for (const item of scriptFunctions) {
    const displayName = namespaceContext ? item.shortName : item.name;
    suggestions.push({
      label: {
        label: displayName,
        description: 'current script',
      },
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: `${displayName}(${item.parameters.join(', ')})`,
      detail: item.signature,
      documentation: buildScriptFunctionDocumentation(item),
      sortText: `2100-${displayName}`,
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

  const scriptFunction = getScriptFunctionByName(model, token.text);
  if (scriptFunction) {
    return {
      range: new monaco.Range(position.lineNumber, token.startColumn, position.lineNumber, token.endColumn),
      contents: [{ value: buildScriptFunctionDocumentation(scriptFunction) }],
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
  if (!item) {
    const scriptFunction = getScriptFunctionByName(model, match[1]);
    if (!scriptFunction) return null;

    const activeParameter = Math.max(0, match[2].split(',').length - 1);
    return {
      value: {
        signatures: [
          {
            label: scriptFunction.signature,
            documentation: '当前脚本中定义的函数。',
            parameters: scriptFunction.parameters.map((parameter) => ({
              label: parameter,
            })),
          },
        ],
        activeSignature: 0,
        activeParameter: Math.min(activeParameter, Math.max(0, scriptFunction.parameters.length - 1)),
      },
      dispose() {},
    };
  }

  const activeParameter = Math.max(0, match[2].split(',').length - 1);
  const parameters = methodMatch ? getInvocationParameters(item, true) : getParameterHints(item);

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
  await ensureLuaDiagnosticsCatalogLoaded();
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
  const markers = analyzeLuaScript(model.getValue()).map((diagnostic) => ({
    severity: diagnostic.severity === 'error'
      ? monaco.MarkerSeverity.Error
      : monaco.MarkerSeverity.Warning,
    message: diagnostic.message,
    startLineNumber: diagnostic.startLineNumber,
    startColumn: diagnostic.startColumn,
    endLineNumber: diagnostic.endLineNumber,
    endColumn: diagnostic.endColumn,
  }));

  monaco.editor.setModelMarkers(model, LUA_MARKER_OWNER, markers);
}
