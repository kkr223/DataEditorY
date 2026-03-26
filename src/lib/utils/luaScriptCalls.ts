import * as luaparse from 'luaparse';

type LuaNode = {
  type?: string;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

export type LuaCallHighlight = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

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

function collectCallHighlightsFromNode(node: LuaNode | undefined, highlights: LuaCallHighlight[]) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'CallExpression') {
    const base = node.base as LuaNode | undefined;
    if (base?.type === 'Identifier') {
      const range = toRange(base);
      if (range) {
        highlights.push(range);
      }
    } else if (base?.type === 'MemberExpression') {
      const member = base.identifier as LuaNode | undefined;
      const range = toRange(member);
      if (range) {
        highlights.push(range);
      }
    }
  }

  for (const value of Object.values(node)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') {
          collectCallHighlightsFromNode(item as LuaNode, highlights);
        }
      }
      continue;
    }

    if (typeof value === 'object') {
      collectCallHighlightsFromNode(value as LuaNode, highlights);
    }
  }
}

export function collectLuaCallHighlights(source: string) {
  try {
    const ast = luaparse.parse(source, {
      comments: false,
      luaVersion: '5.3',
      locations: true,
      ranges: false,
    }) as unknown as LuaNode;

    const highlights: LuaCallHighlight[] = [];
    collectCallHighlightsFromNode(ast, highlights);
    return highlights;
  } catch {
    return [];
  }
}
