import * as luaparse from 'luaparse';

type LuaNode = {
  type?: string;
  isLocal?: boolean;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

export type LuaScopedIdentifier = {
  name: string;
  kind: 'parameter' | 'local' | 'loop';
};

type LuaScope = Map<string, LuaScopedIdentifier>;
type LuaPosition = {
  lineNumber: number;
  column: number;
};

function tryParseLua(source: string) {
  return luaparse.parse(source, {
    comments: false,
    luaVersion: '5.3',
    locations: true,
    ranges: true,
  }) as unknown as LuaNode;
}

function buildFallbackParseSource(source: string, position: LuaPosition) {
  const lines = source.split('\n');
  const index = position.lineNumber - 1;
  if (index < 0 || index >= lines.length) return source;

  const currentLine = lines[index] ?? '';
  const indent = currentLine.match(/^\s*/)?.[0] ?? '';
  lines[index] = `${indent}-- completion placeholder`;
  return lines.join('\n');
}

function comparePosition(left: LuaPosition, right: LuaPosition) {
  if (left.lineNumber !== right.lineNumber) {
    return left.lineNumber - right.lineNumber;
  }
  return left.column - right.column;
}

function getNodeStart(node: LuaNode | undefined): LuaPosition {
  return {
    lineNumber: node?.loc?.start?.line ?? 1,
    column: (node?.loc?.start?.column ?? 0) + 1,
  };
}

function getNodeEnd(node: LuaNode | undefined): LuaPosition {
  return {
    lineNumber: node?.loc?.end?.line ?? 1,
    column: (node?.loc?.end?.column ?? 0) + 1,
  };
}

function isPositionWithinNode(position: LuaPosition, node: LuaNode | undefined) {
  return comparePosition(position, getNodeStart(node)) >= 0 && comparePosition(position, getNodeEnd(node)) <= 0;
}

function declareScopedIdentifier(scope: LuaScope, name: string, kind: LuaScopedIdentifier['kind']) {
  const trimmed = name.trim();
  if (!trimmed) return;
  if (!scope.has(trimmed)) {
    scope.set(trimmed, { name: trimmed, kind });
  }
}

function collectVisibleIdentifiersFromStatements(
  statements: LuaNode[],
  scopes: LuaScope[],
  position: LuaPosition,
): LuaScopedIdentifier[] {
  for (const statement of statements) {
    if (comparePosition(position, getNodeStart(statement)) < 0) {
      break;
    }

    if (statement.type === 'LocalStatement') {
      if (comparePosition(position, getNodeEnd(statement)) > 0) {
        for (const variable of (statement.variables as LuaNode[] | undefined) ?? []) {
          if (variable?.type === 'Identifier') {
            declareScopedIdentifier(scopes[scopes.length - 1], String(variable.name ?? ''), 'local');
          }
        }
      }
      continue;
    }

    if (statement.type === 'FunctionDeclaration') {
      const identifier = statement.identifier as LuaNode | undefined;
      if (statement.isLocal && identifier?.type === 'Identifier') {
        declareScopedIdentifier(scopes[scopes.length - 1], String(identifier.name ?? ''), 'local');
      }

      if (isPositionWithinNode(position, statement)) {
        const localScope: LuaScope = new Map();
        const parameters = (statement.parameters as LuaNode[] | undefined) ?? [];
        for (const parameter of parameters) {
          if (parameter?.type === 'Identifier') {
            declareScopedIdentifier(localScope, String(parameter.name ?? ''), 'parameter');
          }
        }
        return collectVisibleIdentifiersFromStatements(
          (statement.body as LuaNode[] | undefined) ?? [],
          [...scopes, localScope],
          position,
        );
      }

      continue;
    }

    if (statement.type === 'IfStatement') {
      const clauses = (statement.clauses as LuaNode[] | undefined) ?? [];
      for (const clause of clauses) {
        const body = (clause.body as LuaNode[] | undefined) ?? [];
        if (!isPositionWithinNode(position, clause)) continue;
        return collectVisibleIdentifiersFromStatements(body, [...scopes, new Map()], position);
      }
      continue;
    }

    if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement' || statement.type === 'DoStatement') {
      if (isPositionWithinNode(position, statement)) {
        return collectVisibleIdentifiersFromStatements(
          (statement.body as LuaNode[] | undefined) ?? [],
          [...scopes, new Map()],
          position,
        );
      }
      continue;
    }

    if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
      if (isPositionWithinNode(position, statement)) {
        const loopScope: LuaScope = new Map();
        const variables = statement.type === 'ForNumericStatement'
          ? [statement.variable as LuaNode | undefined]
          : ((statement.variables as LuaNode[] | undefined) ?? []);
        for (const variable of variables) {
          if (variable?.type === 'Identifier') {
            declareScopedIdentifier(loopScope, String(variable.name ?? ''), 'loop');
          }
        }
        return collectVisibleIdentifiersFromStatements(
          (statement.body as LuaNode[] | undefined) ?? [],
          [...scopes, loopScope],
          position,
        );
      }
      continue;
    }
  }

  return scopes.flatMap((scope) => Array.from(scope.values()));
}

export function collectLuaScopedIdentifiers(source: string, position: LuaPosition) {
  try {
    let ast: LuaNode;
    try {
      ast = tryParseLua(source);
    } catch {
      ast = tryParseLua(buildFallbackParseSource(source, position));
    }

    const visible = collectVisibleIdentifiersFromStatements((ast.body as LuaNode[] | undefined) ?? [], [new Map()], position);
    const deduped = new Map<string, LuaScopedIdentifier>();
    for (const item of visible) {
      deduped.set(item.name, item);
    }
    return Array.from(deduped.values());
  } catch {
    return [];
  }
}
