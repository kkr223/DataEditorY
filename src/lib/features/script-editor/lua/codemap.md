# src/lib/features/script-editor/lua/

## Responsibility
Lua Analysis Engine — pure Lua code analysis functions with no Monaco dependency. Provides AST-based analysis for completion, diagnostics, semantic tokens, and symbol navigation.

## Files
| File | Purpose |
|------|---------|
| `catalog.ts` | Loads and indexes the Lua intellisense catalog (functions, constants, snippets) |
| `calls.ts` | Extracts function call sites from Lua AST via `luaparse` |
| `scope.ts` | Scope analysis: variable resolution, function parameter tracking, scope chain |
| `symbols.ts` | Symbol extraction: function definitions, variable assignments, symbol table |
| `semantic.ts` | Semantic token classification: function calls, constants, locals, globals |
| `diagnostics.ts` | Basic diagnostics: undefined variables, unused locals, type hints |
| `reference.ts` | Reference manual: function signatures, parameter docs, hover content |
