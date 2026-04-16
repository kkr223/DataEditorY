import * as luaparse from 'luaparse';
import type { LuaCatalog, LuaConstantItem, LuaFunctionItem } from '$lib/types';

type LuaNode = {
  type?: string;
  isLocal?: boolean;
  indexer?: string;
  name?: string;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

type LuaCatalogIndexes = {
  functionsByName: Map<string, LuaFunctionItem>;
  functionsByNamespace: Map<string, LuaFunctionItem[]>;
  functionsByShortName: Map<string, LuaFunctionItem[]>;
  constantsByName: Map<string, LuaConstantItem>;
};

type LuaRuntimeSymbol = LuaVisibleSymbol & {
  hidden?: boolean;
};

type LuaRuntimeScope = Map<string, LuaRuntimeSymbol>;

type LuaSemanticAnalysis = {
  ast: LuaNode;
  sourceLines: string[];
  catalogIndexes: LuaCatalogIndexes;
  rootStatements: LuaNode[];
  globalScope: LuaSemanticScopeNode;
  functionSymbols: LuaScriptFunctionSymbol[];
  references: LuaSemanticReferences;
};

type LuaQueryOptions = {
  tolerant?: boolean;
};

export type LuaSemanticPosition = {
  lineNumber: number;
  column: number;
};

export type LuaSourceRange = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type LuaSemanticTextModel = {
  uri: {
    toString(): string;
  };
  getValue(): string;
  getVersionId(): number;
  getLineContent(lineNumber: number): string;
};

export type LuaVisibleSymbolKind = 'parameter' | 'local' | 'loop' | 'function';

export type LuaVisibleSymbol = {
  name: string;
  kind: LuaVisibleSymbolKind;
  typeName: string | null;
  declarationRange: LuaSourceRange;
};

export type LuaScriptFunctionSymbol = {
  name: string;
  shortName: string;
  namespace: string | null;
  parameters: string[];
  signature: string;
  documentation: string;
  declarationRange: LuaSourceRange;
};

export type LuaSemanticScopeNode = {
  id: string;
  kind: 'root' | 'function' | 'block' | 'loop';
  range: LuaSourceRange;
  symbols: LuaVisibleSymbol[];
  children: LuaSemanticScopeNode[];
  ownerFunction: LuaScriptFunctionSymbol | null;
};

export type LuaSemanticReferences = {
  functionSymbolsByName: Map<string, LuaScriptFunctionSymbol>;
  functionSymbolsByShortName: Map<string, LuaScriptFunctionSymbol[]>;
  symbolsByName: Map<string, LuaVisibleSymbol[]>;
};

export type LuaSemanticParseError = {
  line: number;
  column: number;
  message: string;
};

export type LuaDiagnosticSeverity = 'error' | 'warning';

export type LuaScriptDiagnostic = {
  severity: LuaDiagnosticSeverity;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type LuaSemanticCallInfo = {
  calleeName: string;
  activeParameter: number;
  namespace: string | null;
  indexer: ':' | '.' | null;
  target:
    | { kind: 'catalog'; item: LuaFunctionItem; parameters: string[]; signature: string; documentation: string }
    | { kind: 'script'; item: LuaScriptFunctionSymbol; parameters: string[]; signature: string; documentation: string }
    | null;
  range: LuaSourceRange;
};

export type LuaSemanticHoverInfo =
  | { kind: 'constant'; item: LuaConstantItem; range: LuaSourceRange }
  | { kind: 'catalog-function'; item: LuaFunctionItem; range: LuaSourceRange }
  | { kind: 'script-function'; item: LuaScriptFunctionSymbol; range: LuaSourceRange };

export type LuaSemanticDocument = {
  source: string;
  versionId: number;
  strictAst: LuaNode | null;
  strictParseError: LuaSemanticParseError | null;
  globalScope: LuaSemanticScopeNode;
  functionSymbols: LuaScriptFunctionSymbol[];
  scopeTree: LuaSemanticScopeNode[];
  references: LuaSemanticReferences;
  context: Record<string, unknown> | null;
  sourceLines: string[];
  catalog: LuaCatalog;
  catalogIndexes: LuaCatalogIndexes;
  strictAnalysis: LuaSemanticAnalysis | null;
  fallbackAnalysis: LuaSemanticAnalysis | null;
  tolerantAnalysisByLine: Map<number, LuaSemanticAnalysis | null>;
};

const SCRIPT_NAMESPACE_PATTERN = /^c\d+$/;
const GLOBAL_NAMESPACES = new Set(['Card', 'Effect', 'Group', 'Duel', 'Debug']);
const LUA_BUILTIN_GLOBALS = new Set([
  '_G', '_VERSION', 'assert', 'collectgarbage', 'dofile', 'error', 'getmetatable', 'ipairs', 'load',
  'loadfile', 'next', 'pairs', 'pcall', 'print', 'rawequal', 'rawget', 'rawlen', 'rawset', 'require',
  'select', 'setmetatable', 'tonumber', 'tostring', 'type', 'warn', 'xpcall', 'math', 'string', 'table',
  'coroutine', 'package', 'utf8', 'os', 'io', 'debug', 'bit', 'bit32', 'aux', 'Fusion', 'Synchro', 'Xyz',
  'Link', 'Pendulum', 'Ritual',
]);
const COMMON_PARAM_TYPE_MAP: Record<string, string> = {
  c: 'Card', chkc: 'Card', tc: 'Card', sc: 'Card', fc: 'Card', rc: 'Card', mc: 'Card', xc: 'Card', dc: 'Card',
  pc: 'Card', gc: 'Card', bc: 'Card', cc: 'Card', ac: 'Card', e: 'Effect', re: 'Effect', te: 'Effect',
  ce: 'Effect', g: 'Group', eg: 'Group', sg: 'Group', mg: 'Group', pg: 'Group', dg: 'Group', rg: 'Group',
  fg: 'Group', og: 'Group', vg: 'Group',
};

const strictDocumentCache = new Map<string, LuaSemanticDocument>();

function buildCatalogIndexes(catalog: LuaCatalog): LuaCatalogIndexes {
  const functionsByName = new Map<string, LuaFunctionItem>();
  const functionsByNamespace = new Map<string, LuaFunctionItem[]>();
  const functionsByShortName = new Map<string, LuaFunctionItem[]>();
  const constantsByName = new Map<string, LuaConstantItem>();

  for (const item of catalog.functions) {
    functionsByName.set(item.name, item);
    const namespaceItems = functionsByNamespace.get(item.namespace) ?? [];
    namespaceItems.push(item);
    functionsByNamespace.set(item.namespace, namespaceItems);
    const shortNameItems = functionsByShortName.get(item.shortName) ?? [];
    shortNameItems.push(item);
    functionsByShortName.set(item.shortName, shortNameItems);
  }

  for (const item of catalog.constants) {
    constantsByName.set(item.name, item);
  }

  return { functionsByName, functionsByNamespace, functionsByShortName, constantsByName };
}

function defaultRange(sourceLines: string[]): LuaSourceRange {
  const lastLine = Math.max(sourceLines.length, 1);
  return {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: lastLine,
    endColumn: Math.max((sourceLines[lastLine - 1]?.length ?? 0) + 1, 2),
  };
}

function rangeOf(node: LuaNode | undefined, sourceLines: string[]): LuaSourceRange {
  if (!node?.loc?.start || !node.loc.end) return defaultRange(sourceLines);
  const startLineNumber = node.loc.start.line ?? 1;
  const startColumn = (node.loc.start.column ?? 0) + 1;
  const endLineNumber = node.loc.end.line ?? startLineNumber;
  const rawEndColumn = (node.loc.end.column ?? 0) + 1;
  const maxColumn = (sourceLines[endLineNumber - 1]?.length ?? 0) + 1;
  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: Math.max(startColumn + 1, Math.min(rawEndColumn, Math.max(maxColumn, startColumn + 1))),
  };
}

function comparePositions(left: LuaSemanticPosition, right: LuaSemanticPosition) {
  if (left.lineNumber !== right.lineNumber) return left.lineNumber - right.lineNumber;
  return left.column - right.column;
}

function nodeStart(node: LuaNode | undefined): LuaSemanticPosition {
  return { lineNumber: node?.loc?.start?.line ?? 1, column: (node?.loc?.start?.column ?? 0) + 1 };
}

function nodeEnd(node: LuaNode | undefined): LuaSemanticPosition {
  return { lineNumber: node?.loc?.end?.line ?? 1, column: (node?.loc?.end?.column ?? 0) + 1 };
}

function parseLua(source: string) {
  try {
    return {
      ast: luaparse.parse(source, {
        comments: false,
        luaVersion: '5.3',
        locations: true,
        ranges: true,
      }) as unknown as LuaNode,
      error: null,
    };
  } catch (error) {
    const err = error as { line?: number; column?: number; message?: string };
    return {
      ast: null,
      error: {
        line: err.line ?? 1,
        column: err.column ?? 0,
        message: err.message ?? 'Lua syntax error',
      } satisfies LuaSemanticParseError,
    };
  }
}

function getFunctionNameInfo(node: LuaNode | undefined) {
  if (!node) return null;
  if (node.type === 'Identifier') {
    const name = String(node.name ?? '').trim();
    return name ? { name, namespace: null, shortName: name } : null;
  }
  if (node.type !== 'MemberExpression') return null;

  const base = node.base as LuaNode | undefined;
  const identifier = node.identifier as LuaNode | undefined;
  if (base?.type !== 'Identifier' || identifier?.type !== 'Identifier') return null;
  const namespace = String(base.name ?? '').trim();
  const shortName = String(identifier.name ?? '').trim();
  if (!namespace || !shortName) return null;
  const separator = node.indexer === ':' ? ':' : '.';
  return { name: `${namespace}${separator}${shortName}`, namespace, shortName };
}

function getParameterNames(parameters: LuaNode[] | undefined) {
  return (parameters ?? [])
    .map((parameter) => {
      if (parameter?.type === 'Identifier') return String(parameter.name ?? '');
      if (parameter?.type === 'VarargLiteral') return '...';
      return '';
    })
    .filter(Boolean);
}

function getLeadingLineCommentBlock(sourceLines: string[], declarationLine: number) {
  const lines: string[] = [];

  for (let index = declarationLine - 2; index >= 0; index -= 1) {
    const rawLine = sourceLines[index] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (lines.length > 0) break;
      continue;
    }

    if (!trimmed.startsWith('--') || trimmed.startsWith('--[[')) {
      break;
    }

    lines.unshift(trimmed.replace(/^---?\s?/, '').trim());
  }

  return lines.filter(Boolean).join('\n');
}

function createScopeNode(
  id: string,
  kind: LuaSemanticScopeNode['kind'],
  node: LuaNode | undefined,
  sourceLines: string[],
): LuaSemanticScopeNode {
  return { id, kind, range: rangeOf(node, sourceLines), symbols: [], children: [], ownerFunction: null };
}

function addReferenceSymbol(references: LuaSemanticReferences, symbol: LuaVisibleSymbol) {
  const items = references.symbolsByName.get(symbol.name) ?? [];
  items.push(symbol);
  references.symbolsByName.set(symbol.name, items);
}

function addScopeSymbol(scope: LuaSemanticScopeNode, references: LuaSemanticReferences, symbol: LuaVisibleSymbol) {
  scope.symbols.push(symbol);
  addReferenceSymbol(references, symbol);
}

function addFunctionSymbol(
  functionSymbols: LuaScriptFunctionSymbol[],
  references: LuaSemanticReferences,
  symbol: LuaScriptFunctionSymbol,
) {
  functionSymbols.push(symbol);
  references.functionSymbolsByName.set(symbol.name, symbol);
  const items = references.functionSymbolsByShortName.get(symbol.shortName) ?? [];
  items.push(symbol);
  references.functionSymbolsByShortName.set(symbol.shortName, items);
}

function buildMetadata(statements: LuaNode[], scope: LuaSemanticScopeNode, state: {
  nextScopeId: number;
  sourceLines: string[];
  references: LuaSemanticReferences;
  functionSymbols: LuaScriptFunctionSymbol[];
}) {
  for (const statement of statements) {
    if (statement.type === 'LocalStatement') {
      for (const variable of (statement.variables as LuaNode[] | undefined) ?? []) {
        if (variable?.type !== 'Identifier') continue;
        addScopeSymbol(scope, state.references, {
          name: String(variable.name ?? ''),
          kind: 'local',
          typeName: null,
          declarationRange: rangeOf(variable, state.sourceLines),
        });
      }
      continue;
    }

    if (statement.type === 'FunctionDeclaration') {
      const nameInfo = getFunctionNameInfo(statement.identifier as LuaNode | undefined);
      if (statement.isLocal && nameInfo && nameInfo.namespace === null) {
        addScopeSymbol(scope, state.references, {
          name: nameInfo.name,
          kind: 'function',
          typeName: null,
          declarationRange: rangeOf(statement.identifier as LuaNode | undefined, state.sourceLines),
        });
      }
      if (nameInfo) {
        const parameters = getParameterNames(statement.parameters as LuaNode[] | undefined);
        const functionSymbol = {
          name: nameInfo.name,
          shortName: nameInfo.shortName,
          namespace: nameInfo.namespace,
          parameters,
          signature: `${nameInfo.name}(${parameters.join(', ')})`,
          documentation: getLeadingLineCommentBlock(state.sourceLines, rangeOf(statement, state.sourceLines).startLineNumber),
          declarationRange: rangeOf(statement.identifier as LuaNode | undefined, state.sourceLines),
        };
        addFunctionSymbol(state.functionSymbols, state.references, functionSymbol);

        const functionScope = createScopeNode(`scope-${state.nextScopeId += 1}`, 'function', statement, state.sourceLines);
        functionScope.ownerFunction = functionSymbol;
        scope.children.push(functionScope);
        for (const parameter of (statement.parameters as LuaNode[] | undefined) ?? []) {
          if (parameter?.type !== 'Identifier') continue;
          addScopeSymbol(functionScope, state.references, {
            name: String(parameter.name ?? ''),
            kind: 'parameter',
            typeName: null,
            declarationRange: rangeOf(parameter, state.sourceLines),
          });
        }
        buildMetadata((statement.body as LuaNode[] | undefined) ?? [], functionScope, state);
        continue;
      }
    }

    if (statement.type === 'IfStatement') {
      for (const clause of (statement.clauses as LuaNode[] | undefined) ?? []) {
        const blockScope = createScopeNode(`scope-${state.nextScopeId += 1}`, 'block', clause, state.sourceLines);
        scope.children.push(blockScope);
        buildMetadata((clause.body as LuaNode[] | undefined) ?? [], blockScope, state);
      }
      continue;
    }

    if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement' || statement.type === 'DoStatement') {
      const blockScope = createScopeNode(`scope-${state.nextScopeId += 1}`, 'block', statement, state.sourceLines);
      scope.children.push(blockScope);
      buildMetadata((statement.body as LuaNode[] | undefined) ?? [], blockScope, state);
      continue;
    }

    if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
      const loopScope = createScopeNode(`scope-${state.nextScopeId += 1}`, 'loop', statement, state.sourceLines);
      scope.children.push(loopScope);
      const variables = statement.type === 'ForNumericStatement'
        ? [statement.variable as LuaNode | undefined]
        : ((statement.variables as LuaNode[] | undefined) ?? []);
      for (const variable of variables) {
        if (variable?.type !== 'Identifier') continue;
        addScopeSymbol(loopScope, state.references, {
          name: String(variable.name ?? ''),
          kind: 'loop',
          typeName: null,
          declarationRange: rangeOf(variable, state.sourceLines),
        });
      }
      buildMetadata((statement.body as LuaNode[] | undefined) ?? [], loopScope, state);
    }
  }
}

function createAnalysis(ast: LuaNode, sourceLines: string[], catalogIndexes: LuaCatalogIndexes): LuaSemanticAnalysis {
  const references: LuaSemanticReferences = {
    functionSymbolsByName: new Map(),
    functionSymbolsByShortName: new Map(),
    symbolsByName: new Map(),
  };
  const functionSymbols: LuaScriptFunctionSymbol[] = [];
  const globalScope = createScopeNode('scope-0', 'root', ast, sourceLines);

  buildMetadata((ast.body as LuaNode[] | undefined) ?? [], globalScope, {
    nextScopeId: 0,
    sourceLines,
    references,
    functionSymbols,
  });

  return {
    ast,
    sourceLines,
    catalogIndexes,
    rootStatements: (ast.body as LuaNode[] | undefined) ?? [],
    globalScope,
    functionSymbols,
    references,
  };
}

function buildTolerantLines(sourceLines: string[], position: LuaSemanticPosition, syntaxErrorLine?: number) {
  const lines = [...sourceLines];
  const masked = new Set<number>();
  const maskLine = (lineNumber: number) => {
    const index = lineNumber - 1;
    if (index < 0 || index >= lines.length || masked.has(lineNumber)) return false;
    const indent = lines[index]?.match(/^\s*/)?.[0] ?? '';
    lines[index] = `${indent}-- semantic placeholder`;
    masked.add(lineNumber);
    return true;
  };

  maskLine(position.lineNumber);

  return { lines, maskLine };
}

function parseTolerant(document: LuaSemanticDocument, position: LuaSemanticPosition) {
  const tolerant = buildTolerantLines(document.sourceLines, position, document.strictParseError?.line);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parsed = parseLua(tolerant.lines.join('\n'));
    if (parsed.ast) return createAnalysis(parsed.ast, tolerant.lines, document.catalogIndexes);
    if (!parsed.error || !tolerant.maskLine(parsed.error.line)) break;
  }
  return null;
}

function getCatalogFunction(indexes: LuaCatalogIndexes, name: string) {
  if (indexes.functionsByName.has(name)) return indexes.functionsByName.get(name) ?? null;
  const shortMatches = indexes.functionsByShortName.get(name) ?? [];
  return shortMatches.length === 1 ? shortMatches[0] : null;
}

function getFunctionFromNamespace(indexes: LuaCatalogIndexes, namespace: string, memberName: string) {
  return indexes.functionsByName.get(`${namespace}.${memberName}`) ?? null;
}

function normalizeStaticType(typeName: string | null | undefined) {
  if (!typeName) return null;
  const candidate = typeName
    .split('|')
    .map((item) => item.trim())
    .find((item) => item && item !== 'nil' && item !== 'any' && item !== 'unknown');
  return candidate ? candidate.replace(/[\[\]?]/g, '').trim() || null : null;
}

function getPrimaryReturnType(item: LuaFunctionItem) {
  return item.returnType.split(/[|,\[]/, 1)[0]?.trim() || null;
}

function getInvocationParameters(item: LuaFunctionItem, usesMethodSyntax: boolean) {
  if (!usesMethodSyntax || item.parameters.length === 0) return item.parameters.slice();
  const first = item.parameters[0] ?? '';
  const normalizedType = normalizeStaticType(first.split(/\s+/).slice(0, -1).join(' '));
  const name = first.replace(/[\[\]]/g, '').split('=').at(0)?.trim().split(/\s+/).at(-1)?.replace(/\?$/, '') ?? '';
  if (normalizedType === item.namespace || name === 'self' || (item.namespace === 'Card' && name === 'c')
    || (item.namespace === 'Effect' && name === 'e') || (item.namespace === 'Group' && name === 'g')) {
    return item.parameters.slice(1);
  }
  return item.parameters.slice();
}

function lookupRuntimeBinding(scopes: LuaRuntimeScope[], name: string) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scoped = scopes[index].get(name);
    if (scoped) return scoped;
  }
  return null;
}

function declareRuntimeBinding(
  scope: LuaRuntimeScope,
  name: string,
  kind: LuaVisibleSymbolKind,
  declarationRange: LuaSourceRange,
  typeName: string | null = null,
  hidden = false,
) {
  scope.set(name, { name, kind, typeName, declarationRange, hidden });
}

function findRuntimeScope(scopes: LuaRuntimeScope[], name: string) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    if (scopes[index].has(name)) return scopes[index];
  }
  return null;
}

function isKnownGlobal(indexes: LuaCatalogIndexes, name: string) {
  if (!name) return false;
  if (LUA_BUILTIN_GLOBALS.has(name)) return true;
  if (GLOBAL_NAMESPACES.has(name) || indexes.functionsByNamespace.has(name)) return true;
  if (SCRIPT_NAMESPACE_PATTERN.test(name)) return true;
  if (indexes.constantsByName.has(name)) return true;
  const globalFunction = indexes.functionsByName.get(name);
  return Boolean(globalFunction && globalFunction.namespace === 'global');
}

function inferParameterType(functionNode: LuaNode, parameterName: string, index: number) {
  if (parameterName in COMMON_PARAM_TYPE_MAP) return COMMON_PARAM_TYPE_MAP[parameterName] ?? null;
  const info = getFunctionNameInfo(functionNode.identifier as LuaNode | undefined);
  return info?.shortName === 'initial_effect' && index === 0 && parameterName === 'c' ? 'Card' : null;
}

function inferExpressionType(node: LuaNode | undefined, scopes: LuaRuntimeScope[], analysis: LuaSemanticAnalysis): string | null {
  if (!node) return null;
  if (node.type === 'Identifier') {
    const scoped = lookupRuntimeBinding(scopes, String(node.name ?? ''));
    if (scoped) return scoped.typeName;
    return GLOBAL_NAMESPACES.has(String(node.name ?? '')) ? String(node.name) : null;
  }
  if (node.type === 'CallExpression') {
    const callInfo = resolveCatalogCallFromNode(node, scopes, analysis);
    return callInfo?.item ? normalizeStaticType(getPrimaryReturnType(callInfo.item)) : null;
  }
  if (node.type === 'MemberExpression') {
    const base = node.base as LuaNode | undefined;
    if (base?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(base.name ?? ''))) {
      return String(base.name);
    }
  }
  return null;
}

function resolveCatalogCallFromNode(node: LuaNode, scopes: LuaRuntimeScope[], analysis: LuaSemanticAnalysis) {
  if (node.type !== 'CallExpression') return null;
  const base = node.base as LuaNode | undefined;
  if (!base || base.type !== 'MemberExpression') return null;
  const member = base.identifier as LuaNode | undefined;
  const memberName = typeof member?.name === 'string' ? member.name : '';
  if (!memberName) return null;
  const receiver = base.base as LuaNode | undefined;
  let namespace = inferExpressionType(receiver, scopes, analysis);
  if (!namespace && receiver?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(receiver.name ?? ''))) {
    namespace = String(receiver.name);
  }
  if (!namespace || !analysis.catalogIndexes.functionsByNamespace.has(namespace)) return null;
  return {
    namespace,
    memberName,
    indexer: base.indexer === ':' ? ':' : '.',
    memberNode: member,
    item: getFunctionFromNamespace(analysis.catalogIndexes, namespace, memberName),
  };
}

function collectScopesAt(analysis: LuaSemanticAnalysis, position: LuaSemanticPosition): LuaRuntimeScope[] {
  const rootScope: LuaRuntimeScope = new Map();
  for (const namespace of GLOBAL_NAMESPACES) {
    declareRuntimeBinding(rootScope, namespace, 'local', defaultRange(analysis.sourceLines), namespace, true);
  }

  const walk = (statements: LuaNode[], scopes: LuaRuntimeScope[]): LuaRuntimeScope[] => {
    for (const statement of statements) {
      if (comparePositions(position, nodeStart(statement)) < 0) break;

      if (statement.type === 'LocalStatement') {
        if (comparePositions(position, nodeEnd(statement)) <= 0) break;
        const variables = (statement.variables as LuaNode[] | undefined) ?? [];
        const init = (statement.init as LuaNode[] | undefined) ?? [];
        for (let index = 0; index < variables.length; index += 1) {
          const variable = variables[index];
          if (variable?.type !== 'Identifier') continue;
          declareRuntimeBinding(
            scopes[scopes.length - 1],
            String(variable.name ?? ''),
            'local',
            rangeOf(variable, analysis.sourceLines),
            inferExpressionType(init[index], scopes, analysis),
          );
        }
        continue;
      }

      if (statement.type === 'AssignmentStatement') {
        if (comparePositions(position, nodeEnd(statement)) <= 0) break;
        const variables = (statement.variables as LuaNode[] | undefined) ?? [];
        const init = (statement.init as LuaNode[] | undefined) ?? [];
        for (let index = 0; index < variables.length; index += 1) {
          const variable = variables[index];
          if (variable?.type !== 'Identifier') continue;
          const targetScope = findRuntimeScope(scopes, String(variable.name ?? '')) ?? scopes[0];
          const existing = targetScope.get(String(variable.name ?? ''));
          if (!existing) continue;
          targetScope.set(String(variable.name ?? ''), {
            ...existing,
            typeName: inferExpressionType(init[index], scopes, analysis),
          });
        }
        continue;
      }

      if (statement.type === 'FunctionDeclaration') {
        const nameInfo = getFunctionNameInfo(statement.identifier as LuaNode | undefined);
        if (statement.isLocal && nameInfo && nameInfo.namespace === null) {
          declareRuntimeBinding(scopes[scopes.length - 1], nameInfo.name, 'function', rangeOf(statement.identifier as LuaNode | undefined, analysis.sourceLines));
        }
        const statementRange = rangeOf(statement, analysis.sourceLines);
        const inside = comparePositions(position, { lineNumber: statementRange.startLineNumber, column: statementRange.startColumn }) >= 0
          && comparePositions(position, { lineNumber: statementRange.endLineNumber, column: statementRange.endColumn }) <= 0;
        if (inside) {
          const localScope: LuaRuntimeScope = new Map();
          const parameters = (statement.parameters as LuaNode[] | undefined) ?? [];
          parameters.forEach((parameter, index) => {
            if (parameter?.type !== 'Identifier') return;
            declareRuntimeBinding(
              localScope,
              String(parameter.name ?? ''),
              'parameter',
              rangeOf(parameter, analysis.sourceLines),
              inferParameterType(statement, String(parameter.name ?? ''), index),
            );
          });
          return walk((statement.body as LuaNode[] | undefined) ?? [], [...scopes, localScope]);
        }
        continue;
      }

      if (statement.type === 'IfStatement') {
        for (const clause of (statement.clauses as LuaNode[] | undefined) ?? []) {
          const clauseRange = rangeOf(clause, analysis.sourceLines);
          const inside = comparePositions(position, { lineNumber: clauseRange.startLineNumber, column: clauseRange.startColumn }) >= 0
            && comparePositions(position, { lineNumber: clauseRange.endLineNumber, column: clauseRange.endColumn }) <= 0;
          if (inside) {
            return walk((clause.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()]);
          }
        }
        continue;
      }

      if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement' || statement.type === 'DoStatement') {
        const statementRange = rangeOf(statement, analysis.sourceLines);
        const inside = comparePositions(position, { lineNumber: statementRange.startLineNumber, column: statementRange.startColumn }) >= 0
          && comparePositions(position, { lineNumber: statementRange.endLineNumber, column: statementRange.endColumn }) <= 0;
        if (inside) {
          return walk((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()]);
        }
        continue;
      }

      if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
        const statementRange = rangeOf(statement, analysis.sourceLines);
        const inside = comparePositions(position, { lineNumber: statementRange.startLineNumber, column: statementRange.startColumn }) >= 0
          && comparePositions(position, { lineNumber: statementRange.endLineNumber, column: statementRange.endColumn }) <= 0;
        if (inside) {
          const loopScope: LuaRuntimeScope = new Map();
          const variables = statement.type === 'ForNumericStatement'
            ? [statement.variable as LuaNode | undefined]
            : ((statement.variables as LuaNode[] | undefined) ?? []);
          for (const variable of variables) {
            if (variable?.type === 'Identifier') {
              declareRuntimeBinding(loopScope, String(variable.name ?? ''), 'loop', rangeOf(variable, analysis.sourceLines));
            }
          }
          return walk((statement.body as LuaNode[] | undefined) ?? [], [...scopes, loopScope]);
        }
      }
    }
    return scopes;
  };

  return walk(analysis.rootStatements, [rootScope]);
}

function visibleFromScopes(scopes: LuaRuntimeScope[]) {
  const visible = new Map<string, LuaVisibleSymbol>();
  for (let scopeIndex = scopes.length - 1; scopeIndex >= 0; scopeIndex -= 1) {
    for (const [name, symbol] of scopes[scopeIndex]) {
      if (symbol.hidden || visible.has(name)) continue;
      visible.set(name, {
        name: symbol.name,
        kind: symbol.kind,
        typeName: symbol.typeName,
        declarationRange: symbol.declarationRange,
      });
    }
  }
  return Array.from(visible.values());
}

function analysisFor(document: LuaSemanticDocument, position: LuaSemanticPosition, options: LuaQueryOptions = {}) {
  if (document.strictAnalysis) return document.strictAnalysis;
  if (options.tolerant === false) return document.fallbackAnalysis;
  if (document.tolerantAnalysisByLine.has(position.lineNumber)) {
    return document.tolerantAnalysisByLine.get(position.lineNumber) ?? document.fallbackAnalysis;
  }
  const tolerant = parseTolerant(document, position);
  document.tolerantAnalysisByLine.set(position.lineNumber, tolerant);
  return tolerant ?? document.fallbackAnalysis;
}

function tokenAt(sourceLines: string[], position: LuaSemanticPosition) {
  const line = sourceLines[position.lineNumber - 1] ?? '';
  let start = position.column - 1;
  let end = position.column - 1;
  while (start > 0 && /[\w.:]/.test(line[start - 1] ?? '')) start -= 1;
  while (end < line.length && /[\w.:]/.test(line[end] ?? '')) end += 1;
  return {
    text: line.slice(start, end),
    range: {
      startLineNumber: position.lineNumber,
      startColumn: start + 1,
      endLineNumber: position.lineNumber,
      endColumn: end + 1,
    } satisfies LuaSourceRange,
  };
}

export function getLuaSemanticDocument(model: LuaSemanticTextModel, catalog: LuaCatalog, context: Record<string, unknown> | null = null) {
  const uri = model.uri.toString();
  const versionId = model.getVersionId();
  const cacheKey = `${uri}::${versionId}`;
  const cached = strictDocumentCache.get(cacheKey);
  if (cached) return cached;

  const source = model.getValue();
  const sourceLines = source.split('\n');
  const catalogIndexes = buildCatalogIndexes(catalog);
  const strict = parseLua(source);
  const strictAnalysis = strict.ast ? createAnalysis(strict.ast, sourceLines, catalogIndexes) : null;
  const fallbackAnalysis = strictAnalysis ?? (() => {
    const draft: LuaSemanticDocument = {
      source,
      versionId,
      strictAst: null,
      strictParseError: strict.error,
      globalScope: createScopeNode('scope-empty', 'root', undefined, sourceLines),
      functionSymbols: [],
      scopeTree: [],
      references: { functionSymbolsByName: new Map(), functionSymbolsByShortName: new Map(), symbolsByName: new Map() },
      context,
      sourceLines,
      catalog,
      catalogIndexes,
      strictAnalysis: null,
      fallbackAnalysis: null,
      tolerantAnalysisByLine: new Map(),
    };
    return parseTolerant(draft, { lineNumber: strict.error?.line ?? 1, column: (strict.error?.column ?? 0) + 1 });
  })();

  const structure = strictAnalysis ?? fallbackAnalysis;
  const document: LuaSemanticDocument = {
    source,
    versionId,
    strictAst: strict.ast,
    strictParseError: strict.error,
    globalScope: structure?.globalScope ?? createScopeNode('scope-empty', 'root', undefined, sourceLines),
    functionSymbols: structure?.functionSymbols ?? [],
    scopeTree: structure?.globalScope.children ?? [],
    references: structure?.references ?? { functionSymbolsByName: new Map(), functionSymbolsByShortName: new Map(), symbolsByName: new Map() },
    context,
    sourceLines,
    catalog,
    catalogIndexes,
    strictAnalysis,
    fallbackAnalysis,
    tolerantAnalysisByLine: new Map(),
  };

  strictDocumentCache.set(cacheKey, document);
  for (const key of strictDocumentCache.keys()) {
    if (key.startsWith(`${uri}::`) && key !== cacheKey) strictDocumentCache.delete(key);
  }
  return document;
}

export function getVisibleSymbolsAt(document: LuaSemanticDocument, position: LuaSemanticPosition, options: LuaQueryOptions = {}) {
  const analysis = analysisFor(document, position, options);
  return analysis ? visibleFromScopes(collectScopesAt(analysis, position)) : [];
}

export function getFunctionSymbols(document: LuaSemanticDocument) {
  return document.functionSymbols.slice();
}

export function getCurrentFunctionAt(
  document: LuaSemanticDocument,
  position: LuaSemanticPosition,
  options: LuaQueryOptions = {},
): LuaScriptFunctionSymbol | null {
  const analysis = analysisFor(document, position, options);
  if (!analysis) return null;

  let current: LuaScriptFunctionSymbol | null = null;

  const visit = (scope: LuaSemanticScopeNode) => {
    const range = scope.range;
    const inside = comparePositions(position, { lineNumber: range.startLineNumber, column: range.startColumn }) >= 0
      && comparePositions(position, { lineNumber: range.endLineNumber, column: range.endColumn }) <= 0;
    if (!inside) return;

    if (scope.ownerFunction) {
      current = scope.ownerFunction;
    }

    for (const child of scope.children) {
      visit(child);
    }
  };

  visit(analysis.globalScope);
  return current;
}

export function getCallInfoAt(document: LuaSemanticDocument, position: LuaSemanticPosition, options: LuaQueryOptions = {}): LuaSemanticCallInfo | null {
  const analysis = analysisFor(document, position, options);
  if (!analysis) return null;
  const linePrefix = document.sourceLines[position.lineNumber - 1]?.slice(0, position.column - 1) ?? '';
  const match = linePrefix.match(/([A-Za-z_][\w.:]*)\s*\(([^()]*)$/);
  if (!match) return null;

  const calleeName = match[1] ?? '';
  const activeParameter = Math.max(0, (match[2] ?? '').split(',').length - 1);
  const scopes = collectScopesAt(analysis, position);
  const methodMatch = calleeName.match(/^([A-Za-z_][\w]*)\:(\w+)$/);
  let namespace: string | null = null;
  let indexer: ':' | '.' | null = null;
  let target: LuaSemanticCallInfo['target'] = null;

  if (methodMatch) {
    indexer = ':';
    const receiver = lookupRuntimeBinding(scopes, methodMatch[1]);
    namespace = receiver?.typeName || (GLOBAL_NAMESPACES.has(methodMatch[1]) ? methodMatch[1] : null);
    const item = namespace ? getFunctionFromNamespace(analysis.catalogIndexes, namespace, methodMatch[2]) : (getCatalogFunction(analysis.catalogIndexes, methodMatch[2]) ?? null);
    if (item) {
      target = {
        kind: 'catalog',
        item,
        parameters: getInvocationParameters(item, true),
        signature: `${item.returnType} ${item.signature}`,
        documentation: item.description,
      };
    }
  } else {
    const catalogFunction = getCatalogFunction(analysis.catalogIndexes, calleeName);
    if (catalogFunction) {
      target = {
        kind: 'catalog',
        item: catalogFunction,
        parameters: getInvocationParameters(catalogFunction, false),
        signature: `${catalogFunction.returnType} ${catalogFunction.signature}`,
        documentation: catalogFunction.description,
      };
    } else {
      const scriptFunction = document.references.functionSymbolsByName.get(calleeName)
        ?? (() => {
          const matches = document.references.functionSymbolsByShortName.get(calleeName) ?? [];
          return matches.length === 1 ? matches[0] : null;
        })();
      if (scriptFunction) {
        target = {
          kind: 'script',
          item: scriptFunction,
          parameters: scriptFunction.parameters,
          signature: scriptFunction.signature,
          documentation: scriptFunction.documentation || '当前脚本中定义的函数。',
        };
      }
    }
  }

  return {
    calleeName,
    activeParameter,
    namespace,
    indexer,
    target,
    range: {
      startLineNumber: position.lineNumber,
      startColumn: Math.max(1, position.column - calleeName.length - (match[2] ?? '').length - 1),
      endLineNumber: position.lineNumber,
      endColumn: Math.max(2, position.column - (match[2] ?? '').length - 1),
    },
  };
}

export function getHoverInfoAt(document: LuaSemanticDocument, position: LuaSemanticPosition, options: LuaQueryOptions = {}): LuaSemanticHoverInfo | null {
  const analysis = analysisFor(document, position, options);
  if (!analysis) return null;

  const line = document.sourceLines[position.lineNumber - 1] ?? '';
  const scopes = collectScopesAt(analysis, position);
  for (const match of line.matchAll(/([A-Za-z_][\w]*)\s*([:.])\s*([A-Za-z_]\w*)/g)) {
    const start = (match.index ?? 0) + 1;
    const end = start + match[0].length;
    if (position.column < start || position.column > end) continue;
    const receiverName = match[1] ?? '';
    const memberName = match[3] ?? '';
    const namespace = match[2] === ':'
      ? (lookupRuntimeBinding(scopes, receiverName)?.typeName || (GLOBAL_NAMESPACES.has(receiverName) ? receiverName : null))
      : receiverName;
    const item = namespace ? getFunctionFromNamespace(analysis.catalogIndexes, namespace, memberName) : null;
    if (item) {
      const memberStart = start + match[0].lastIndexOf(memberName);
      return {
        kind: 'catalog-function',
        item,
        range: {
          startLineNumber: position.lineNumber,
          startColumn: memberStart,
          endLineNumber: position.lineNumber,
          endColumn: memberStart + memberName.length,
        },
      };
    }
  }

  const token = tokenAt(document.sourceLines, position);
  if (!token.text) return null;
  const constant = analysis.catalogIndexes.constantsByName.get(token.text);
  if (constant) return { kind: 'constant', item: constant, range: token.range };
  const catalogFunction = getCatalogFunction(analysis.catalogIndexes, token.text);
  if (catalogFunction) return { kind: 'catalog-function', item: catalogFunction, range: token.range };
  const scriptFunction = document.references.functionSymbolsByName.get(token.text)
    ?? (() => {
      const matches = document.references.functionSymbolsByShortName.get(token.text) ?? [];
      return matches.length === 1 ? matches[0] : null;
    })();
  return scriptFunction ? { kind: 'script-function', item: scriptFunction, range: token.range } : null;
}

export function getDiagnostics(document: LuaSemanticDocument) {
  const diagnostics: LuaScriptDiagnostic[] = [];
  if (document.strictParseError) {
    diagnostics.push({
      severity: 'error',
      message: document.strictParseError.message,
      startLineNumber: document.strictParseError.line,
      startColumn: document.strictParseError.column + 1,
      endLineNumber: document.strictParseError.line,
      endColumn: document.strictParseError.column + 2,
    });
    if (document.strictParseError.message.includes("'end' expected")) {
      const lastLine = Math.max(document.sourceLines.length, 1);
      diagnostics.push({
        severity: 'warning',
        message: '看起来存在未闭合的 function/end 结构。',
        startLineNumber: lastLine,
        startColumn: 1,
        endLineNumber: lastLine,
        endColumn: Math.max(2, (document.sourceLines[lastLine - 1]?.length ?? 0) + 1),
      });
    }
  }
  if (!document.strictAnalysis) return diagnostics;

  const rootScope: LuaRuntimeScope = new Map();
  for (const namespace of GLOBAL_NAMESPACES) {
    declareRuntimeBinding(rootScope, namespace, 'local', defaultRange(document.sourceLines), namespace, true);
  }

  const pushWarning = (node: LuaNode | undefined, message: string) => {
    diagnostics.push({ severity: 'warning', message, ...rangeOf(node, document.sourceLines) });
  };

  const walkExpression = (node: LuaNode | undefined, scopes: LuaRuntimeScope[]) => {
    if (!node) return;
    if (node.type === 'Identifier') {
      const name = String(node.name ?? '');
      if (!lookupRuntimeBinding(scopes, name) && !isKnownGlobal(document.catalogIndexes, name)) {
        pushWarning(node, `Undefined global variable: ${name}.`);
      }
      return;
    }
    if (node.type === 'CallExpression') {
      const callInfo = resolveCatalogCallFromNode(node, scopes, document.strictAnalysis!);
      if (callInfo) {
        if (!callInfo.item) {
          pushWarning(callInfo.memberNode, `${callInfo.namespace}.${callInfo.memberName} is not a known API member.`);
        } else {
          const args = Array.isArray(node.arguments) ? node.arguments.length : 0;
          const params = getInvocationParameters(callInfo.item, callInfo.indexer === ':').filter(Boolean);
          const minArgs = params.filter((item) => !item.includes('[') && !item.includes('?') && !item.includes('...') && !item.includes('|nil')).length;
          const variadic = params.some((item) => item.includes('...'));
          if (args < minArgs) pushWarning(callInfo.memberNode, `${callInfo.item.name} expects ${minArgs} argument(s), got ${args}.`);
          else if (!variadic && args > params.length) pushWarning(callInfo.memberNode, `${callInfo.item.name} expects at most ${params.length} argument(s), got ${args}.`);
        }
      }
      walkExpression(node.base as LuaNode | undefined, scopes);
      for (const argument of (node.arguments as LuaNode[] | undefined) ?? []) walkExpression(argument, scopes);
      return;
    }
    if (node.type === 'MemberExpression') {
      walkExpression(node.base as LuaNode | undefined, scopes);
      return;
    }
    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      walkExpression(node.left as LuaNode | undefined, scopes);
      walkExpression(node.right as LuaNode | undefined, scopes);
      return;
    }
    if (node.type === 'UnaryExpression') {
      walkExpression(node.argument as LuaNode | undefined, scopes);
      return;
    }
    if (node.type === 'TableConstructorExpression') {
      for (const field of (node.fields as LuaNode[] | undefined) ?? []) {
        walkExpression((field.value as LuaNode | undefined) ?? field, scopes);
      }
    }
  };

  const walkStatements = (statements: LuaNode[], scopes: LuaRuntimeScope[]) => {
    for (const statement of statements) {
      if (statement.type === 'LocalStatement' || statement.type === 'AssignmentStatement') {
        const variables = (statement.variables as LuaNode[] | undefined) ?? [];
        const init = (statement.init as LuaNode[] | undefined) ?? [];
        const isLocal = statement.type === 'LocalStatement';
        for (const expression of init) walkExpression(expression, scopes);
        for (let index = 0; index < variables.length; index += 1) {
          const variable = variables[index];
          if (variable?.type !== 'Identifier') continue;
          const targetScope = isLocal ? scopes[scopes.length - 1] : (findRuntimeScope(scopes, String(variable.name ?? '')) ?? scopes[0]);
          declareRuntimeBinding(
            targetScope,
            String(variable.name ?? ''),
            'local',
            rangeOf(variable, document.sourceLines),
            inferExpressionType(init[index], scopes, document.strictAnalysis!),
          );
        }
        continue;
      }
      if (statement.type === 'CallStatement') {
        walkExpression(statement.expression as LuaNode | undefined, scopes);
        continue;
      }
      if (statement.type === 'ReturnStatement') {
        for (const argument of (statement.arguments as LuaNode[] | undefined) ?? []) walkExpression(argument, scopes);
        continue;
      }
      if (statement.type === 'FunctionDeclaration') {
        const info = getFunctionNameInfo(statement.identifier as LuaNode | undefined);
        if (statement.isLocal && info && info.namespace === null) {
          declareRuntimeBinding(scopes[scopes.length - 1], info.name, 'function', rangeOf(statement.identifier as LuaNode | undefined, document.sourceLines));
        } else if ((statement.identifier as LuaNode | undefined)?.type === 'MemberExpression') {
          const base = ((statement.identifier as LuaNode | undefined)?.base as LuaNode | undefined);
          if (base?.type === 'Identifier' && !lookupRuntimeBinding(scopes, String(base.name ?? '')) && !isKnownGlobal(document.catalogIndexes, String(base.name ?? ''))) {
            declareRuntimeBinding(scopes[0], String(base.name ?? ''), 'local', rangeOf(base, document.sourceLines));
          }
        }
        const localScope: LuaRuntimeScope = new Map();
        ((statement.parameters as LuaNode[] | undefined) ?? []).forEach((parameter, index) => {
          if (parameter?.type !== 'Identifier') return;
          declareRuntimeBinding(
            localScope,
            String(parameter.name ?? ''),
            'parameter',
            rangeOf(parameter, document.sourceLines),
            inferParameterType(statement, String(parameter.name ?? ''), index),
          );
        });
        walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, localScope]);
        continue;
      }
      if (statement.type === 'IfStatement') {
        const clauses = (statement.clauses as LuaNode[] | undefined) ?? [];
        walkExpression((clauses[0]?.condition as LuaNode | undefined) ?? undefined, scopes);
        for (const clause of clauses) {
          if ((clause.condition as LuaNode | undefined) && clause !== clauses[0]) {
            walkExpression(clause.condition as LuaNode | undefined, scopes);
          }
          walkStatements((clause.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()]);
        }
        continue;
      }
      if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement') {
        walkExpression(statement.condition as LuaNode | undefined, scopes);
        walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()]);
        continue;
      }
      if (statement.type === 'DoStatement') {
        walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()]);
        continue;
      }
      if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
        const loopScope: LuaRuntimeScope = new Map();
        const variables = statement.type === 'ForNumericStatement'
          ? [statement.variable as LuaNode | undefined]
          : ((statement.variables as LuaNode[] | undefined) ?? []);
        for (const variable of variables) {
          if (variable?.type === 'Identifier') {
            declareRuntimeBinding(loopScope, String(variable.name ?? ''), 'loop', rangeOf(variable, document.sourceLines));
          }
        }
        walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, loopScope]);
      }
    }
  };

  walkStatements(document.strictAnalysis.rootStatements, [rootScope]);
  return diagnostics;
}

