# src-tauri/src/document_host/

## Responsibility

Document Host Protocol — structured protocol for CDB document operations (open, query, execute, save, undo, close). Frontend CDB card CRUD should route through this layer, not direct Tauri commands.

## Design

### Protocol Commands (`commands.rs`)

Generic document host handlers that dispatch by provider ID:
- `provider_open` — opens or creates a CDB session, returns initial card data
- `provider_query` — dispatches `CardCollectionQuery` variants (Search, GetById, GetByIds, FindByNames, All)
- `provider_execute` — dispatches `CardCollectionCommand` variants (Upsert, Delete) with undo recording
- `provider_save` — saves working copy to destination path
- `provider_undo` — pops and reverses the last undo entry
- `provider_close` — cleans up session and undo stack
- `codec_export` — copies CDB file to export destination

### CDB Host (`cdb.rs`)

Implements document operations for the CDB provider:
- **Query dispatch** — routes to `cdb_cards::search_cards_page`, `get_card_by_id`, `get_cards_by_ids`, `query_cards_raw`
- **Command execution** — `Upsert` (with snapshot for undo) and `Delete` (with full card backup for undo)
- **Undo** — `UndoEntry::Upsert` restores previous cards and deletes newly created ones; `UndoEntry::Delete` re-inserts deleted cards
- **Undo stack** — max 100 entries per document, FIFO eviction

### Search Compiler (`search.rs`)

Compiles `CardSearchExpression` AST (from frontend) into SQL WHERE clauses with bound parameters:
- `TextContains` → `LIKE '%...%'` on `texts.name` or `texts.desc`
- `NumericCompare` → comparison on `datas.id`, `datas.atk`, `datas.def`, `datas.level`, `datas.attribute`, `datas.race`, `datas.type`, `datas.linkmarker`
- `MaskContains` → `(column & :param) = :param` bitmask check
- `IdPrefix` → numeric range query for prefix matching
- `InIds` — chunked IN-clause (400 items per chunk) for image folder / deck text filters
- Boolean combinators: `And`, `Or`, `Not`

### Models (`models.rs`)

DTOs for the document host protocol: `CardCollectionQuery`, `CardCollectionCommand`, `CardSearchExpression`, `CardSearchPage`, etc.

## Integration

- **Consumed by**: Frontend via `infrastructure/tauri/documentHost.ts` and typed `native/cdbApi.ts`
- **Depends on**: `services/cdb_cards`, `services/cdb_session`, `session/cdb`
