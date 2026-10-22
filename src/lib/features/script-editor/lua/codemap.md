# src/lib/features/script-editor/lua/

## Responsibility
Lua Analysis Engine — pure Lua code analysis functions with no Monaco dependency. Provides AST-based analysis for completion, diagnostics, semantic tokens, and symbol navigation.

## Files
| File | Purpose |
|------|---------|
| `catalog.ts` | Loads and indexes the Lua intellisense catalog (functions, constants, snippets) |
| `calls.ts` | Extracts function call sites from Lua AST via `luaparse` |
| `semantic.ts` | Semantic analysis: scope chain, symbol extraction, call/hover resolution, diagnostics source |
| `diagnostics.ts` | Basic diagnostics: undefined variables, unused locals, type hints |
| `reference.ts` | Reference manual: function signatures, parameter docs, hover content |

## Runtime Resources

- `catalog.ts` resolves installed `lua-intel/` resources through the typed native API, with flat source/legacy resource directories as a fallback.
- Installed `_functions.txt` entries are compared with the bundled source. Edited descriptions override `def.lua` documentation while retaining unchanged typed signatures; edited signatures override the same-name definition. Unchanged entries retain the richer typed definitions.
- Missing companion files fall back independently, so a missing `def.lua` or `constant.lua` cannot discard installed function edits. Catalog consumers cache resources for the app session; restart after replacing resource files.
- Semantic document caches check catalog identity, so loading external resources invalidates hints even when the script text/version is unchanged.
