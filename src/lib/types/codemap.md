# src/lib/types/

## Responsibility

Shared Type Definitions — TypeScript interfaces and types used across the entire frontend codebase.

## Key Types

- `SearchFilters` — all search filter fields (name, desc, id, ATK/DEF range, type, attribute, race, setcode, rule, image folder, deck text)
- `CardSearchQuery` — `{ whereClause, params }` for SQL query execution
- `CardDataEntry` — complete card data (17+ fields: code, alias, setcode[], type, attack, defense, level, race, attribute, category, ot, name, desc, strings[], lscale, rscale, linkMarker, ruleCode)
- `DbWorkspaceState` — CDB tab state (path, cached cards/filters/selection, dirty flag)
- `CardDraftState` — editor draft (original code, snapshot, card data)
- `ScriptWorkspaceState` — script tab state (path, content, saved content, dirty flag, view state)
- `BitOption`, `SelectOption`, `LinkMarkerOption` — UI option types for dropdowns/checkboxes
- `DEFAULT_SEARCH_FILTERS` — empty filter state

## Integration

- **Consumed by**: virtually every module in the frontend
