# src/lib/infrastructure/tauri/

## Responsibility

Tauri IPC Adapter — owns raw `invoke()` calls and the document host client. Most feature code should call `src/lib/native/*Api.ts`; this directory is the low-level transport.

## Design

### Two IPC Protocols

1. **Direct Commands** (`commands.ts`) — typed wrappers around `invokeCommand()` for specific Rust handlers:
   - CDB operations: `readCdb`, `writeCdb`, `createCdbFromCards`, `analyzeCdbMerge`, `executeCdbMerge`, `collectMergeSourcesFromFolder`
   - Media/FS: `readTextFile`, `writeFile`, `writeBinaryFile`, `pathExists`, `listImageFolderEntries`, `copyImage`, `readImage`, `importCardImage`, `loadStringsConf`
   - Scripts: `getCardScriptInfo`, `readCardScriptDocument`, `writeCardScript`, `saveCardScript`
   - Settings: `loadAppSettings`, `saveAppSettings`, `loadSecretKey`, `setCoverImage`, `clearCoverImage`
   - Metadata/tasks/assets: workspace metadata, Lua replace, asset checks, and long-task helpers
   - Package: `packageCdbAssetsAsZip`
   - App: `appendErrorLog`, `consumePendingOpenCdbPaths`, `openInSystemEditor`, `openInDefaultApp`

2. **Document Host Transport** (`platform/transport/tauri.ts`) — generic provider operations:
   - `provider_open` / `provider_query` / `provider_execute` / `provider_save` / `provider_undo` / `provider_close`
   - `DocumentHostProvider` in `platform/transport/provider.ts` adapts the transport to the CDB module

### Bridge Object

`index.ts` exports `tauriBridge` — a convenience object re-exporting Tauri plugin APIs (`ask`, `message`, `open`, `save`, `convertFileSrc`, `dirname`, `join`, `listen`, `resolveResource`).

## Files

| File | Purpose |
|------|---------|
| `index.ts` | `invokeCommand<T>()` wrapper + `tauriBridge` object |
| `commands.ts` | ~30 typed Rust command wrappers + TS types for DTOs |

## Integration

- **Consumed by**: native APIs, stores (`db.ts`, `search.ts`, `scriptEditor.svelte.ts`), services, `appRuntime.ts`
- **Depends on**: `@tauri-apps/api/core`, `@tauri-apps/api/event`, `@tauri-apps/api/path`, `@tauri-apps/plugin-dialog`
