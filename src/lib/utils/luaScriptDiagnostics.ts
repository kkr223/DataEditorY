import * as luaparse from 'luaparse';
import { luaCatalog as defaultLuaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { loadExternalLuaCatalog } from '$lib/utils/luaIntelCatalog';
import type { LuaCatalog, LuaFunctionItem } from '$lib/types';

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

const DECLARED_NAME_SENTINEL = '__declared__';
const SCRIPT_NAMESPACE_PATTERN = /^c\d+$/;

export type LuaDiagnosticSeverity = 'error' | 'warning';

export type LuaScriptDiagnostic = {
  severity: LuaDiagnosticSeverity;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

const METHOD_NAMESPACES = new Set(['Card', 'Effect', 'Group']);
const GLOBAL_NAMESPACES = new Set(['Card', 'Effect', 'Group', 'Duel', 'Debug']);
const LUA_BUILTIN_GLOBALS = new Set([
  '_G',
  '_VERSION',
  'assert',
  'collectgarbage',
  'dofile',
  'error',
  'getmetatable',
  'ipairs',
  'load',
  'loadfile',
  'next',
  'pairs',
  'pcall',
  'print',
  'rawequal',
  'rawget',
  'rawlen',
  'rawset',
  'require',
  'select',
  'setmetatable',
  'tonumber',
  'tostring',
  'type',
  'warn',
  'xpcall',
  'math',
  'string',
  'table',
  'coroutine',
  'package',
  'utf8',
  'os',
  'io',
  'debug',
  'bit',
  'bit32',
  'aux',
  'Fusion',
  'Synchro',
  'Xyz',
  'Link',
  'Pendulum',
  'Ritual',
]);
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

let luaCatalog: LuaCatalog = defaultLuaCatalog;
let functionsByName = new Map<string, LuaFunctionItem>();
let functionsByNamespace = new Map<string, LuaFunctionItem[]>();
let functionsByShortName = new Map<string, LuaFunctionItem[]>();
let catalogLoadPromise: Promise<void> | null = null;

function rebuildCatalogIndexes() {
  functionsByName = new Map(luaCatalog.functions.map((item) => [item.name, item]));
  functionsByNamespace = new Map<string, LuaFunctionItem[]>();
  functionsByShortName = new Map<string, LuaFunctionItem[]>();

  for (const item of luaCatalog.functions) {
    const namespaceItems = functionsByNamespace.get(item.namespace) ?? [];
    namespaceItems.push(item);
    functionsByNamespace.set(item.namespace, namespaceItems);

    const shortNameItems = functionsByShortName.get(item.shortName) ?? [];
    shortNameItems.push(item);
    functionsByShortName.set(item.shortName, shortNameItems);
  }
}

function isKnownNamespaceName(name: string) {
  return GLOBAL_NAMESPACES.has(name) || functionsByNamespace.has(name);
}

function isKnownGlobalName(name: string) {
  if (!name) return false;
  if (LUA_BUILTIN_GLOBALS.has(name)) return true;
  if (isKnownNamespaceName(name)) return true;
  if (SCRIPT_NAMESPACE_PATTERN.test(name)) return true;
  if (luaCatalog.constants.some((item) => item.name === name)) return true;
  const globalFunction = functionsByName.get(name);
  return Boolean(globalFunction && globalFunction.namespace === 'global');
}

function lookupScopedValue(scopes: LuaScope[], name: string) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scoped = scopes[index].get(name);
    if (scoped) {
      return scoped;
    }
  }

  return null;
}

function isNameDeclared(scopes: LuaScope[], name: string) {
  return lookupScopedValue(scopes, name) !== null || isKnownGlobalName(name);
}

function declareScopedName(scope: LuaScope, name: string, typeName?: LuaStaticType | null) {
  scope.set(name, typeName || DECLARED_NAME_SENTINEL);
}

function findDeclaredScope(scopes: LuaScope[], name: string) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index].has(name)) {
      return scopes[index];
    }
  }

  return null;
}

rebuildCatalogIndexes();

export async function ensureLuaDiagnosticsCatalogLoaded() {
  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const externalCatalog = await loadExternalLuaCatalog();
      if (externalCatalog) {
        luaCatalog = externalCatalog;
        rebuildCatalogIndexes();
      }
    })();
  }

  await catalogLoadPromise;
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

function getFunctionCallInfo(node: LuaNode, scopes: LuaScope[], sourceLines: string[]) {
  if (node.type !== 'CallExpression') return null;

  const base = node.base as LuaNode | undefined;
  if (!base || base.type !== 'MemberExpression') return null;

  const memberIdentifier = base.identifier as LuaNode | undefined;
  const memberName = typeof memberIdentifier?.name === 'string' ? memberIdentifier.name : '';
  if (!memberName) return null;

  const receiver = base.base as LuaNode | undefined;
  let namespace: LuaStaticType | null = inferExpressionType(receiver, scopes, sourceLines);

  if (!namespace && receiver?.type === 'Identifier') {
    namespace = inferReceiverNamespace(sourceLines, String(receiver.name ?? ''), receiver.loc?.start?.line ?? 1);
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
    item: getFunctionFromNamespace(namespace, memberName),
  };
}

function inferExpressionType(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  sourceLines: string[],
): LuaStaticType | null {
  if (!node) return null;

  if (node.type === 'Identifier') {
    const name = String(node.name ?? '');
    const scoped = lookupScopedValue(scopes, name);
    if (scoped) {
      return scoped === DECLARED_NAME_SENTINEL ? null : scoped;
    }
    if (isKnownNamespaceName(name)) {
      return name;
    }
    return null;
  }

  if (node.type === 'CallExpression') {
    const callInfo = getFunctionCallInfo(node, scopes, sourceLines);
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

function getMarkerRange(node: LuaNode | undefined, sourceLines: string[]) {
  const startLineNumber = node?.loc?.start?.line ?? 1;
  const startColumn = (node?.loc?.start?.column ?? 0) + 1;
  const endLineNumber = node?.loc?.end?.line ?? startLineNumber;
  const maxColumn = (sourceLines[endLineNumber - 1]?.length ?? 0) + 1;
  const rawEndColumn = (node?.loc?.end?.column ?? startColumn) + 1;

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: Math.max(startColumn + 1, Math.min(rawEndColumn, Math.max(maxColumn, startColumn + 1))),
  };
}

function pushDiagnostic(
  diagnostics: LuaScriptDiagnostic[],
  severity: LuaDiagnosticSeverity,
  sourceLines: string[],
  node: LuaNode | undefined,
  message: string,
) {
  diagnostics.push({
    severity,
    message,
    ...getMarkerRange(node, sourceLines),
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
  sourceLines: string[],
  diagnostics: LuaScriptDiagnostic[],
) {
  const callInfo = getFunctionCallInfo(node, scopes, sourceLines);
  if (!callInfo) return;

  if (!callInfo.item) {
    pushDiagnostic(
      diagnostics,
      'warning',
      sourceLines,
      callInfo.memberNode,
      `${callInfo.namespace}.${callInfo.memberName} is not a known API member.`,
    );
    return;
  }

  const argumentCount = Array.isArray(node.arguments) ? node.arguments.length : 0;
  const arity = getArityExpectation(callInfo.item, callInfo.indexer === ':');

  if (argumentCount < arity.minArgs) {
    pushDiagnostic(
      diagnostics,
      'warning',
      sourceLines,
      callInfo.memberNode,
      `${callInfo.item.name} expects ${arity.minArgs} argument(s), got ${argumentCount}.`,
    );
    return;
  }

  if (arity.maxArgs !== null && argumentCount > arity.maxArgs) {
    pushDiagnostic(
      diagnostics,
      'warning',
      sourceLines,
      callInfo.memberNode,
      `${callInfo.item.name} expects at most ${arity.maxArgs} argument(s), got ${argumentCount}.`,
    );
  }
}

function walkExpression(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  sourceLines: string[],
  diagnostics: LuaScriptDiagnostic[],
) {
  if (!node) return;

  if (node.type === 'Identifier') {
    const name = String(node.name ?? '');
    if (!isNameDeclared(scopes, name)) {
      pushDiagnostic(
        diagnostics,
        'warning',
        sourceLines,
        node,
        `Undefined global variable: ${name}.`,
      );
    }
    return;
  }

  if (node.type === 'CallExpression') {
    validateCallExpression(node, scopes, sourceLines, diagnostics);
    walkExpression(node.base as LuaNode | undefined, scopes, sourceLines, diagnostics);
    for (const argument of (node.arguments as LuaNode[] | undefined) ?? []) {
      walkExpression(argument, scopes, sourceLines, diagnostics);
    }
    return;
  }

  if (node.type === 'MemberExpression') {
    walkExpression(node.base as LuaNode | undefined, scopes, sourceLines, diagnostics);
    return;
  }

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    walkExpression(node.left as LuaNode | undefined, scopes, sourceLines, diagnostics);
    walkExpression(node.right as LuaNode | undefined, scopes, sourceLines, diagnostics);
    return;
  }

  if (node.type === 'UnaryExpression') {
    walkExpression(node.argument as LuaNode | undefined, scopes, sourceLines, diagnostics);
    return;
  }

  if (node.type === 'TableConstructorExpression') {
    for (const field of (node.fields as LuaNode[] | undefined) ?? []) {
      walkExpression((field.value as LuaNode | undefined) ?? field, scopes, sourceLines, diagnostics);
    }
  }
}

function walkStatements(
  statements: LuaNode[],
  scopes: LuaScope[],
  sourceLines: string[],
  diagnostics: LuaScriptDiagnostic[],
) {
  for (const statement of statements) {
    if (statement.type === 'LocalStatement' || statement.type === 'AssignmentStatement') {
      const variables = (statement.variables as LuaNode[] | undefined) ?? [];
      const init = (statement.init as LuaNode[] | undefined) ?? [];
      const isLocalStatement = statement.type === 'LocalStatement';

      for (const expression of init) {
        walkExpression(expression, scopes, sourceLines, diagnostics);
      }

      for (let index = 0; index < variables.length; index += 1) {
        const variable = variables[index];
        if (variable?.type !== 'Identifier') continue;
        const inferred = inferExpressionType(init[index], scopes, sourceLines);
        const targetScope = isLocalStatement
          ? scopes[scopes.length - 1]
          : (findDeclaredScope(scopes, String(variable.name)) ?? scopes[0]);
        declareScopedName(targetScope, String(variable.name), inferred);
      }
      continue;
    }

    if (statement.type === 'CallStatement') {
      walkExpression(statement.expression as LuaNode | undefined, scopes, sourceLines, diagnostics);
      continue;
    }

    if (statement.type === 'ReturnStatement') {
      for (const argument of (statement.arguments as LuaNode[] | undefined) ?? []) {
        walkExpression(argument, scopes, sourceLines, diagnostics);
      }
      continue;
    }

    if (statement.type === 'FunctionDeclaration') {
      const localScope: LuaScope = new Map();
      const functionIdentifier = statement.identifier as LuaNode | undefined;
      const isLocalFunction = Boolean(statement.isLocal);
      if (functionIdentifier?.type === 'Identifier') {
        const targetScope = isLocalFunction ? scopes[scopes.length - 1] : scopes[0];
        declareScopedName(targetScope, String(functionIdentifier.name));
      } else if (functionIdentifier?.type === 'MemberExpression') {
        const baseIdentifier = functionIdentifier.base as LuaNode | undefined;
        if (baseIdentifier?.type === 'Identifier' && !isNameDeclared(scopes, String(baseIdentifier.name))) {
          declareScopedName(scopes[0], String(baseIdentifier.name));
        }
      }
      const parameters = (statement.parameters as LuaNode[] | undefined) ?? [];
      parameters.forEach((parameter, index) => {
        if (parameter?.type !== 'Identifier') return;
        const inferredType = inferFunctionParameterType(statement, String(parameter.name), index);
        declareScopedName(localScope, String(parameter.name), inferredType);
      });
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, localScope], sourceLines, diagnostics);
      continue;
    }

    if (statement.type === 'IfStatement') {
      const clauses = (statement.clauses as LuaNode[] | undefined) ?? [];
      walkExpression((clauses[0]?.condition as LuaNode | undefined) ?? undefined, scopes, sourceLines, diagnostics);
      for (const clause of clauses) {
        if ((clause.condition as LuaNode | undefined) && clause !== clauses[0]) {
          walkExpression(clause.condition as LuaNode | undefined, scopes, sourceLines, diagnostics);
        }
        walkStatements((clause.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], sourceLines, diagnostics);
      }
      continue;
    }

    if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement') {
      walkExpression(statement.condition as LuaNode | undefined, scopes, sourceLines, diagnostics);
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], sourceLines, diagnostics);
      continue;
    }

    if (statement.type === 'DoStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], sourceLines, diagnostics);
      continue;
    }

    if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], sourceLines, diagnostics);
    }
  }
}

function validateStaticTypes(ast: LuaNode, sourceLines: string[], diagnostics: LuaScriptDiagnostic[]) {
  const rootScope: LuaScope = new Map();
  for (const namespace of GLOBAL_NAMESPACES) {
    rootScope.set(namespace, namespace);
  }
  walkStatements((ast.body as LuaNode[] | undefined) ?? [], [rootScope], sourceLines, diagnostics);
}

function getFunctionForCall(name: string) {
  if (functionsByName.has(name)) {
    return functionsByName.get(name) ?? null;
  }

  const byShortName = functionsByShortName.get(name) ?? [];
  return byShortName.length === 1 ? byShortName[0] : null;
}

function inferReceiverNamespace(sourceLines: string[], receiverName: string, lineNumber: number) {
  const escapedReceiver = receiverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignmentPattern = new RegExp(
    `(?:local\\s+)?(?:[A-Za-z_][\\w]*\\s*,\\s*)*${escapedReceiver}\\s*(?:,\\s*[A-Za-z_][\\w]*)*\\s*=\\s*([A-Za-z_][\\w.]*)\\s*\\(`,
    'g',
  );

  for (let currentLine = lineNumber; currentLine >= 1; currentLine -= 1) {
    const line = sourceLines[currentLine - 1] ?? '';
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

export function analyzeLuaScript(source: string): LuaScriptDiagnostic[] {
  const diagnostics: LuaScriptDiagnostic[] = [];
  const sourceLines = source.split('\n');
  let ast: LuaNode | null = null;

  try {
    ast = luaparse.parse(source, {
      comments: false,
      luaVersion: '5.3',
      locations: true,
      ranges: true,
    }) as unknown as LuaNode;
  } catch (error) {
    const err = error as { line?: number; column?: number; message?: string };
    diagnostics.push({
      severity: 'error',
      message: err.message ?? 'Lua syntax error',
      startLineNumber: err.line ?? 1,
      startColumn: (err.column ?? 0) + 1,
      endLineNumber: err.line ?? 1,
      endColumn: (err.column ?? 0) + 2,
    });

    if ((err.message ?? '').includes("'end' expected")) {
      const lastLineNumber = Math.max(sourceLines.length, 1);
      diagnostics.push({
        severity: 'warning',
        message: '看起来存在未闭合的 function/end 结构。',
        startLineNumber: lastLineNumber,
        startColumn: 1,
        endLineNumber: lastLineNumber,
        endColumn: Math.max(2, (sourceLines[lastLineNumber - 1]?.length ?? 0) + 1),
      });
    }
  }

  if (ast) {
    validateStaticTypes(ast, sourceLines, diagnostics);
  }

  return diagnostics;
}
