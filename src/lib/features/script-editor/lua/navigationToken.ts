import * as luaparse from 'luaparse';
import type { LuaSemanticPosition } from './semantic';

// Lexing can retain a reference while tolerant AST parsing masks an incomplete call.
export function findLuaReferenceToken(source: string, position: LuaSemanticPosition) {
  const types = (luaparse as unknown as { tokenTypes: { Identifier: number; EOF: number } }).tokenTypes;
  const lines = source.split('\n');
  const offset = lines.slice(0, position.lineNumber - 1).reduce((size, line) => size + line.length + 1, 0) + position.column - 1;
  const previous: luaparse.Token[] = [];
  try {
    const parser = luaparse.parse(source, { wait: true, comments: false });
    for (let token = parser.lex(); token.type !== types.EOF; token = parser.lex()) {
      if (token.range[0] > offset) return null;
      if (token.type === types.Identifier && token.range[0] <= offset && offset <= token.range[1]) {
        let name = token.value;
        for (let index = previous.length - 1; index >= 1; index -= 2) {
          if (!['.', ':'].includes(previous[index].value) || previous[index - 1].type !== types.Identifier) break;
          name = `${previous[index - 1].value}.${name}`;
        }
        return { name, node: { type: 'Identifier', name: token.value, loc: {
          start: { line: token.line, column: token.range[0] - token.lineStart },
          end: { line: token.line, column: token.range[1] - token.lineStart },
        } } };
      }
      previous.push(token);
    }
  } catch { /* Unfinished strings are intentionally not navigable. */ }
  return null;
}
