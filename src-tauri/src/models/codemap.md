# src-tauri/src/models/

## Responsibility

Data Transfer Objects — Rust structs for request/response serialization between frontend and backend.

## Modules

### `app.rs`

App-level configuration types:
- `AppSettings` — full settings struct (script template, AI config, package patterns, language, etc.)
- `AiSettings` — AI model, URL, temperature, encrypted key
- Path resolution helpers

### `cdb.rs`

CDB operation types:
- `CardDto` — complete card data (mirrors `CardDataEntry` on frontend, implements `ygopro_cdb_encode_rs::CardFields`)
- `OpenCdbTabResponse` — `{ name, cached_total, cached_cards }`
- `SearchCardsPageRequest` / `SearchCardsPageResponse` — paginated search
- `ModifyCardsRequest`, `DeleteCardsRequest`, `GetCardsByIdsRequest`, `QueryCardsRequest`
- `UndoModifyOperationRequest` — undo with restore + delete lists

## Integration

- **Consumed by**: `commands/`, `services/`, `document_host/`, `session/`
- **Depends on**: `serde` (serialization), `ygopro-cdb-encode-rs` (CardFields trait)
