import type { LuaSemanticDocument, LuaSemanticPosition, LuaSourceRange } from './semantic';
import { findLuaReferenceToken } from './navigationToken';

type Node = { type?: string; loc?: { start: { line: number; column: number }; end: { line: number; column: number } }; [key: string]: unknown };
type Binding = { name: string; node: Node };
type Scope = { parent?: Scope; bindings: Binding[]; receiver?: { name: string; scope: Scope; position: LuaSemanticPosition } };
type Definition = { name: string; node: Node; scope: Scope };
export type LuaNavigationTarget =
  | { kind: 'function'; origin: LuaSourceRange; target: LuaSourceRange }
  | { kind: 'script'; origin: LuaSourceRange; path: string };

const loadScriptLinks = new WeakMap<LuaSemanticDocument, Array<{ range: LuaSourceRange; path: string }>>();

const rangeOf = (node: Node): LuaSourceRange => ({
  startLineNumber: node.loc!.start.line, startColumn: node.loc!.start.column + 1,
  endLineNumber: node.loc!.end.line, endColumn: node.loc!.end.column + 1,
});
const startsBefore = (node: Node, position: LuaSemanticPosition) => !!node.loc && (
  node.loc.start.line < position.lineNumber || (node.loc.start.line === position.lineNumber && node.loc.start.column < position.column)
);
const contains = (node: Node, position: LuaSemanticPosition) => startsBefore(node, position) && !!node.loc && (
  position.lineNumber < node.loc.end.line || (position.lineNumber === node.loc.end.line && position.column <= node.loc.end.column + 1)
);
const nameOf = (node?: Node): string => {
  if (node?.type === 'Identifier') return String(node.name ?? '');
  if (node?.type !== 'MemberExpression') return '';
  const base = nameOf(node.base as Node);
  return base ? `${base}.${nameOf(node.identifier as Node)}` : '';
};
const selectionNode = (node: Node) => node.type === 'MemberExpression' ? node.identifier as Node : node;
const lookup = (scope: Scope | undefined, name: string, position: LuaSemanticPosition): Binding | undefined => {
  if (!scope) return undefined;
  return scope.bindings.findLast((binding) => binding.name === name && startsBefore(binding.node, position))
    ?? lookup(scope.parent, name, position);
};

const readString = (node?: Node) => {
  if (node?.type !== 'StringLiteral') return null;
  const raw = String(node.raw ?? '');
  const long = raw.match(/^\[(=*)\[([\s\S]*)\]\1\]$/);
  if (long) return long[2].replace(/^\r?\n/, '');
  if (!/^(['"])[\s\S]*\1$/.test(raw)) return null;
  // Paths may contain escaped quotes/backslashes; control escapes are not filenames.
  const value = raw.slice(1, -1);
  let supported = true;
  const decoded = value.replace(/\\([\s\S])/g, (_escape, char: string) => {
    if (!['\\', "'", '"'].includes(char)) supported = false;
    return char;
  });
  return supported ? decoded : null;
};

export function findLuaNavigationTarget(document: LuaSemanticDocument, position: LuaSemanticPosition): LuaNavigationTarget | null {
  const ast = document.strictAst ?? document.fallbackAnalysis?.ast;
  if (!ast) return null;
  const definitions: Definition[] = [];
  const rootScope: Scope = { bindings: [] };
  let fallbackScope = rootScope;
  let reference: Definition | undefined;
  let script: Extract<LuaNavigationTarget, { kind: 'script' }> | undefined;

  const visitFunction = (node: Node, identifier: Node | undefined, scope: Scope) => {
    const name = nameOf(identifier);
    if (name && identifier) definitions.push({ name, node: identifier, scope });
    const bodyScope: Scope = { parent: scope, bindings: [] };
    if (contains(node, position)) fallbackScope = bodyScope;
    if (identifier?.type === 'MemberExpression' && identifier.indexer === ':') {
      bodyScope.receiver = { name: nameOf(identifier.base as Node), scope, position: {
        lineNumber: identifier.loc!.start.line, column: identifier.loc!.start.column + 1,
      } };
    }
    for (const parameter of (node.parameters as Node[] ?? [])) bodyScope.bindings.push({ name: nameOf(parameter), node: parameter });
    for (const child of (node.body as Node[] ?? [])) visit(child, bodyScope);
  };
  const visit = (node: Node, scope: Scope): void => {
    if (node.type === 'FunctionDeclaration') {
      const identifier = node.identifier as Node | undefined;
      if (node.isLocal && identifier) scope.bindings.push({ name: nameOf(identifier), node: identifier });
      visitFunction(node, identifier, scope);
      return;
    }
    if (node.type === 'LocalStatement' || node.type === 'AssignmentStatement') {
      const variables = node.variables as Node[] ?? [];
      const initializers = node.init as Node[] ?? [];
      if (node.type === 'LocalStatement') {
        for (const variable of variables) scope.bindings.push({ name: nameOf(variable), node: variable });
      }
      initializers.forEach((initializer, index) => {
        if (initializer.type === 'FunctionDeclaration') visitFunction(initializer, variables[index], scope);
        else visit(initializer, scope);
      });
      return;
    }
    if (node.type === 'CallExpression' || node.type === 'StringCallExpression') {
      const args = node.arguments ?? node.argument;
      const argument = Array.isArray(args) ? args[0] as Node | undefined : args as Node | undefined;
      const base = node.base as Node;
      const path = nameOf(base) === 'Duel.LoadScript' && !lookup(scope, 'Duel', position) ? readString(argument) : null;
      if (path && !/[\0\r\n]/.test(path) && argument && (contains(argument, position) || contains(selectionNode(base), position))) {
        script = { kind: 'script', origin: rangeOf(contains(argument, position) ? argument : selectionNode(base)), path };
      }
    }
    if (node.type === 'MemberExpression' && contains(selectionNode(node), position)) reference = { name: nameOf(node), node: selectionNode(node), scope };
    else if (node.type === 'Identifier' && contains(node, position) && !reference) reference = { name: nameOf(node), node, scope };

    const childScope: Scope = ['DoStatement', 'WhileStatement', 'RepeatStatement', 'IfClause', 'ElseifClause', 'ElseClause', 'ForNumericStatement', 'ForGenericStatement'].includes(node.type ?? '')
      ? { parent: scope, bindings: [] } : scope;
    if (childScope !== scope && contains(node, position)) fallbackScope = childScope;
    if (node.type === 'ForNumericStatement' || node.type === 'ForGenericStatement') {
      for (const variable of (node.variables as Node[] ?? [node.variable as Node])) childScope.bindings.push({ name: nameOf(variable), node: variable });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'range' || key === 'comments' || (node.type === 'MemberExpression' && key === 'identifier')) continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === 'object' && 'type' in child) visit(child, childScope);
      } else if (value && typeof value === 'object' && 'type' in value) visit(value as Node, childScope);
    }
  };
  // Semantic parsing always enables locations; its public AST type is more permissive.
  visit(ast as Node, rootScope);
  if (script) return script;
  if (!reference && !document.strictAst) {
    const token = findLuaReferenceToken(document.source, position);
    if (token) reference = { ...token, scope: fallbackScope };
  }
  if (!reference?.name) return null;

  const identity = (name: string, scope: Scope, at: LuaSemanticPosition): { name: string; binding: Binding | undefined } => {
    const [base, ...members] = name.split('.');
    if (base === 'self') {
      for (let current: Scope | undefined = scope; current; current = current.parent) {
        if (current.receiver && !lookup(scope, 'self', at)) return identity(`${current.receiver.name}.${members.join('.')}`, current.receiver.scope, current.receiver.position);
      }
    }
    return { name: members.join('.'), binding: lookup(scope, base, at) };
  };
  const expected = identity(reference.name, reference.scope, position);
  const matches = definitions.filter((definition) => {
    const actual = identity(definition.name, definition.scope, {
      lineNumber: definition.node.loc!.start.line, column: definition.node.loc!.start.column + 1,
    });
    return actual.binding === expected.binding && actual.name === expected.name
      && (actual.binding || definition.name === reference!.name);
  });
  const target = matches.findLast((definition) => startsBefore(definition.node, position)) ?? matches[0];
  return target ? { kind: 'function', origin: rangeOf(reference.node), target: rangeOf(selectionNode(target.node)) } : null;
}

export function getLuaLoadScriptLinks(document: LuaSemanticDocument) {
  const cached = loadScriptLinks.get(document);
  if (cached) return cached;
  const links: Array<{ range: LuaSourceRange; path: string }> = [];
  const visit = (node: Node) => {
    if (node.type === 'CallExpression' || node.type === 'StringCallExpression') {
      const args = node.arguments ?? node.argument;
      const argument = Array.isArray(args) ? args[0] as Node | undefined : args as Node | undefined;
      const base = node.base as Node;
      if (nameOf(base) === 'Duel.LoadScript' && argument?.loc?.start) {
        const target = findLuaNavigationTarget(document, { lineNumber: argument.loc.start.line, column: argument.loc.start.column + 1 });
        if (target?.kind === 'script') {
          links.push({ range: rangeOf(argument), path: target.path }, { range: rangeOf(selectionNode(base)), path: target.path });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc' || key === 'range' || key === 'comments') continue;
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child === 'object' && 'type' in child) visit(child);
      } else if (value && typeof value === 'object' && 'type' in value) visit(value as Node);
    }
  };
  const ast = document.strictAst ?? document.fallbackAnalysis?.ast;
  if (ast) visit(ast as Node);
  loadScriptLinks.set(document, links);
  return links;
}
