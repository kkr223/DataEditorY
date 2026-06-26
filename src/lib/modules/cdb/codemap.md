# src/lib/modules/cdb/

## Responsibility
CDB Module — provides the `.cdb` file codec and the `TauriDocumentProvider` that routes all CDB data operations to the Rust backend via IPC.

## Design
- `CDB_CODEC_ID` = `cdb.codec` — handles `.cdb` file pattern
- `CDB_PROVIDER_ID` = `cdb.provider` — uses `TauriDocumentProvider` for Rust-backed operations
- Codec's `decode` returns the card collection type; `encode` delegates to `saveProviderDocument`
- Depends on `card` module for `CARD_COLLECTION_TYPE`

## Integration
- **Consumed by**: platform runtime (when opening `.cdb` files)
- **Depends on**: `card` module, `infrastructure/tauri/documentHost`
