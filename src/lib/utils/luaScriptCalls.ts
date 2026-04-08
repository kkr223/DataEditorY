import * as luaparse from 'luaparse';
import { luaCatalog } from '$lib/data/lua-intel/catalog.generated';

type LuaNode = {
  type?: string;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

export type LuaInlineHighlightClassName =
  | 'lua-call-highlight'
  | 'lua-call-arg-highlight'
  | 'lua-parameter-highlight'
  | 'lua-constant-highlight';

export type LuaCallHighlight = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type LuaInlineHighlight = LuaCallHighlight & {
  className: LuaInlineHighlightClassName;
};

const catalogFunctionNames = new Set(luaCatalog.functions.map((item) => item.name));
const catalogFunctionShortNames = new Set(luaCatalog.functions.map((item) => item.shortName));
const catalogConstantNames = new Set(luaCatalog.constants.map((item) => item.name));

function toRange(node: LuaNode | undefined) {
  if (!node?.loc?.start || !node.loc.end) {
    return null;
  }

  return {
    startLineNumber: node.loc.start.line,
    startColumn: node.loc.start.column + 1,
    endLineNumber: node.loc.end.line,
    endColumn: node.loc.end.column + 1,
  } satisfies LuaCallHighlight;
}

function collectFunctionNames(node: LuaNode | undefined, names: Set<string>) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'FunctionDeclaration') {
    const identifier = node.identifier as LuaNode | undefined;
    if (identifier?.type === 'Identifier' && typeof identifier.name === 'string') {
      names.add(identifier.name);
    } else if (identifier?.type === 'MemberExpression') {
      const base = identifier.base as LuaNode | undefined;
      const member = identifier.identifier as LuaNode | undefined;
      if (member?.type === 'Identifier' && typeof member.name === 'string') {
        names.add(member.name);
        if (base?.type === 'Identifier' && typeof base.name === 'string') {
          names.add(`${base.name}${identifier.indexer === ':' ? ':' : '.'}${member.name}`);
        }
      }
    }
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          collectFunctionNames(item as LuaNode, names);
        }
      }
      continue;
    }

    if (typeof value === 'object') {
      collectFunctionNames(value as LuaNode, names);
    }
  }
}

function collectParameterNames(node: LuaNode | undefined) {
  const names = new Set<string>();
  const parameters = Array.isArray(node?.parameters) ? node.parameters as LuaNode[] : [];
  for (const parameter of parameters) {
    if (parameter.type === 'Identifier' && typeof parameter.name === 'string') {
      names.add(parameter.name);
    }
  }
  return names;
}

function pushHighlight(
  highlights: LuaInlineHighlight[],
  node: LuaNode | undefined,
  className: LuaInlineHighlightClassName,
) {
  const range = toRange(node);
  if (!range) return;
  highlights.push({
    ...range,
    className,
  });
}

function isCallableReference(node: LuaNode | undefined, scriptFunctionNames: Set<string>) {
  if (!node || typeof node !== 'object') return false;

  if (node.type === 'Identifier' && typeof node.name === 'string') {
    return scriptFunctionNames.has(node.name) || catalogFunctionShortNames.has(node.name);
  }

  if (node.type === 'MemberExpression') {
    const base = node.base as LuaNode | undefined;
    const member = node.identifier as LuaNode | undefined;
    if (member?.type !== 'Identifier' || typeof member.name !== 'string') {
      return false;
    }

    const qualifiedName = base?.type === 'Identifier' && typeof base.name === 'string'
      ? `${base.name}${node.indexer === ':' ? ':' : '.'}${member.name}`
      : null;

    return scriptFunctionNames.has(member.name)
      || (qualifiedName ? scriptFunctionNames.has(qualifiedName) : false)
      || catalogFunctionShortNames.has(member.name)
      || (qualifiedName ? catalogFunctionNames.has(qualifiedName) : false);
  }

  return false;
}

function collectInlineHighlightsFromNode(
  node: LuaNode | undefined,
  highlights: LuaInlineHighlight[],
  scriptFunctionNames: Set<string>,
  parameterScopes: Set<string>[] = [],
) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'FunctionDeclaration') {
    const nextParameterScopes = [...parameterScopes, collectParameterNames(node)];
    const body = Array.isArray(node.body) ? node.body as LuaNode[] : [];
    for (const statement of body) {
      collectInlineHighlightsFromNode(statement, highlights, scriptFunctionNames, nextParameterScopes);
    }
    return;
  }

  if (node.type === 'CallExpression') {
    const base = node.base as LuaNode | undefined;
    if (base?.type === 'Identifier') {
      pushHighlight(highlights, base, 'lua-call-highlight');
    } else if (base?.type === 'MemberExpression') {
      const member = base.identifier as LuaNode | undefined;
      pushHighlight(highlights, member, 'lua-call-highlight');
    }

    const argumentsList = Array.isArray(node.arguments) ? node.arguments as LuaNode[] : [];
    for (const argumentNode of argumentsList) {
      if (isCallableReference(argumentNode, scriptFunctionNames)) {
        if (argumentNode.type === 'Identifier') {
          pushHighlight(highlights, argumentNode, 'lua-call-arg-highlight');
        } else if (argumentNode.type === 'MemberExpression') {
          const member = argumentNode.identifier as LuaNode | undefined;
          pushHighlight(highlights, member, 'lua-call-arg-highlight');
        }
      }
    }
  }

  const identifierName = node.type === 'Identifier' && typeof node.name === 'string'
    ? node.name
    : null;

  if (
    node.type === 'Identifier'
    && identifierName
    && parameterScopes.some((scope) => scope.has(identifierName))
  ) {
    pushHighlight(highlights, node, 'lua-parameter-highlight');
  }

  if (node.type === 'Identifier' && identifierName && catalogConstantNames.has(identifierName)) {
    pushHighlight(highlights, node, 'lua-constant-highlight');
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          collectInlineHighlightsFromNode(item as LuaNode, highlights, scriptFunctionNames, parameterScopes);
        }
      }
      continue;
    }

    if (typeof value === 'object') {
      collectInlineHighlightsFromNode(value as LuaNode, highlights, scriptFunctionNames, parameterScopes);
    }
  }
}

export function collectLuaCallHighlights(source: string) {
  return collectLuaInlineHighlights(source)
    .filter((item) => item.className === 'lua-call-highlight')
    .map(({ className: _className, ...range }) => range);
}

export function collectLuaInlineHighlights(source: string) {
  try {
    const ast = luaparse.parse(source, {
      comments: false,
      luaVersion: '5.3',
      locations: true,
      ranges: false,
    }) as unknown as LuaNode;

    const scriptFunctionNames = new Set<string>();
    collectFunctionNames(ast, scriptFunctionNames);

    const highlights: LuaInlineHighlight[] = [];
    collectInlineHighlightsFromNode(ast, highlights, scriptFunctionNames);
    return highlights;
  } catch {
    return [];
  }
}
