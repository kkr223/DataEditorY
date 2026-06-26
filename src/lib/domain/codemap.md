# src/lib/domain/

## Responsibility

Domain Layer — pure business logic with no framework or infrastructure dependencies. Contains card taxonomy, draft helpers, validation, batch operations, search query construction, rule expression parsing, and script workspace identity logic.

## Design

Organized by aggregate root:
- `card/` — card data model, taxonomy, setcode handling, draft state, validation, batch operation semantics
- `search/` — SQL query building from UI filters, rule expression parsing (DSL → AST → SQL), source filter composition
- `script/` — Lua script workspace logic, normalization, and CDB-aware script tab identity

All modules are pure functions and types — no side effects, no store subscriptions, no IPC calls.

## Integration

- **Consumed by**: stores, features, services, modules
- **Depends on**: `$lib/types` (shared type definitions)
- **Sub-maps**: [card/](card/codemap.md) | [search/](search/codemap.md) | [script/](script/codemap.md)
