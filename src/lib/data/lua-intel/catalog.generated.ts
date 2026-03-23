import constants from './constants.generated.json';
import functions from './functions.generated.json';
import snippets from './snippets.generated.json';
import type { LuaCatalog } from '$lib/types';

const keywords = [
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "goto",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while"
] as const;

export const luaCatalog: LuaCatalog = {
  constants,
  functions,
  snippets,
  keywords: [...keywords],
};

export { constants as luaConstants, functions as luaFunctions, snippets as luaSnippets, keywords as luaKeywords };
