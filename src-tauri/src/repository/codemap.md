# src-tauri/src/repository/

## Responsibility

Data Access Layer — thin adapter over `ygopro-cdb-encode-rs` / CDB encoder library APIs. App code should not implement CDB schema or raw card CRUD SQL here.

## Design

### `cdb.rs`

Delegates all CDB operations to `YgoProCdb` from the `ygopro-cdb-encode-rs` crate:
- `open_cdb(path)` — opens existing CDB file
- `create_cdb(path)` — creates new CDB with schema
- `load_all_cards_from_path(path)` — loads all cards (full data)
- `load_card_summaries_from_path(path)` — loads only `(code, type)` pairs (lightweight, for merge analysis)
- `recreate_cdb_with_cards(path, cards)` — creates fresh CDB and bulk-inserts cards

Keep lightweight summary and export paths behind the repository API so higher layers do not depend on SQLite details.

## Integration

- **Consumed by**: `services/cdb_session`, `services/merge`, `commands/cdb`
- **Depends on**: `ygopro-cdb-encode-rs`
