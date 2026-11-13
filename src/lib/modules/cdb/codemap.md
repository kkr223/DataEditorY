# src/lib/modules/cdb/

## Responsibility
CDB Module — provides the `.cdb` file codec and the document host provider that routes CDB data operations through a `DocumentHostTransport` (Tauri `invoke` today, Web Worker for the web build).

## Design
- `createCdbModule(transport)` builds the module for the active transport
- `CDB_CODEC_ID` = `cdb.codec` — handles `.cdb` file pattern
- `CDB_PROVIDER_ID` = `cdb.provider` — uses `platform/transport/provider.ts`
- Codec's `decode` returns the card collection type; saving is handled by the provider, not the codec
- Depends on `card` module for `CARD_COLLECTION_TYPE`

## Integration
- **Consumed by**: platform runtime (when opening `.cdb` files)
- **Depends on**: `card` module, `platform/transport/`
