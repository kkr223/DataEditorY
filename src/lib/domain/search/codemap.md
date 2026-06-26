# src/lib/domain/search/

## Responsibility

Search Engine Domain — builds SQL WHERE clauses from UI filter state and parses rule expression DSL into structured search expressions.

## Design

### Query Builder (`query.ts`)

Mirrors DataEditorX `GetSelectSQL` logic. Iterates each filter field from `SearchFilters` and appends AND clauses:
- **Name/Desc** — `LIKE` with ordered keyword pattern (`%%` as separator) or unordered multi-term matching
- **ID/Alias** — numeric prefix matching (e.g., `473` → matches `4730xxxx`)
- **ATK/DEF** — numeric range with DEX convention (`-1` = match `0`, `?` = match `-2`)
- **Type/Subtype/Attribute/Race** — bitmask AND matching
- **Setcode** — joins with setcode values using bitmask containment
- **Rule expression** — parsed via `ruleExpression.ts` and compiled to SQL
- **Image folder filter** — IN-clause with resolved card IDs
- **Deck text filter** — IN-clause with parsed card IDs

### Rule Expression Parser (`ruleExpression.ts`)

Custom DSL parser for advanced card search:
- Grammar: `expr = term ((AND|OR) term)* | NOT expr`
- Terms: `field op value` where field is `id|alias|atk|def|level|attribute|race|type|linkmarker`
- Operators: `>`, `<`, `>=`, `<=`, `=`, `!=`, `contains` (alias `&`)
- Values: numeric literals or named constants (e.g., `dark`, `dragon`, `fusion`)
- Output: `CardSearchExpression` AST sent to Rust for SQL compilation

### Source Filters (`sourceFilters.ts`)

Handles image-folder and deck-text filter pre-processing:
- Parses image folder entries (numeric filenames → card codes, non-numeric → name lookup)
- Parses YDK deck text format into card code sets
- Caches results per tab, invalidates on DB modification

## Files

| File | Purpose |
|------|---------|
| `query.ts` | DEX-style SQL WHERE clause builder from `SearchFilters` |
| `ruleExpression.ts` | Rule expression DSL tokenizer, parser, and AST builder |
| `sourceFilters.ts` | Image folder and deck text filter resolution + caching |

## Integration

- **Consumed by**: `stores/search.ts`, card editor search controller
- **Depends on**: `domain/card/taxonomy` (constant maps), `$lib/types` (SearchFilters, CardSearchQuery)
