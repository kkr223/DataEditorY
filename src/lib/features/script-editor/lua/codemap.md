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
