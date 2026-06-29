# src/lib/domain/search/

## Responsibility

Search Engine Domain — builds a structured `CardSearchExpression` AST from UI filter state and parses the rule expression DSL. SQL compilation happens in the Rust document host (`document_host/search.rs`); this layer no longer emits SQL text.

## Design

### Query Helpers (`query.ts`)

Small, pure helpers shared with the search expression builder. Currently exposes:
- `parseSetcodeFilter` — parses a hex setcode string like `"0x1af"` or `"12ab"` into a 16-bit number.

The previous DEX-style SQL WHERE builder (`buildSearchQuery`) was removed: it duplicated the Rust `document_host/search.rs` SQL compiler and had no production callers (the live path uses `buildCardSearchExpression` → AST → Rust compilation).

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
| `query.ts` | Shared search helpers (`parseSetcodeFilter`) |
| `ruleExpression.ts` | Rule expression DSL tokenizer, parser, and AST builder |
| `sourceFilters.ts` | Image folder and deck text filter resolution + caching |

## Integration

- **Consumed by**: `modules/card/searchExpression.ts`, `stores/search.ts`, card editor search controller
- **Depends on**: `$lib/types` (SearchFilters)
