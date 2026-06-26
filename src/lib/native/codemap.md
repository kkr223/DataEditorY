# src/lib/native/

## Responsibility

Typed Native API Boundary — frontend-facing wrappers around Tauri/document-host operations. Feature and module code should call these APIs instead of scattered direct `invoke()` calls.

## Modules

| File | Purpose |
|------|---------|
| `cdbApi.ts` | Product-level CDB session operations: open/create/search/get/commit/undo/save/close and batch operation preview/apply |
| `scriptApi.ts` | Script file read/write/save/open helpers |
| `assetApi.ts` | Asset checks and related filesystem helpers |
| `metadataApi.ts` | `.dey/{cdb-stem}.workspace.json` load/save/backup |
| `taskApi.ts` | Long-running task start/get/cancel/progress boundary |
| `settingsApi.ts` | App settings and secret-related settings calls |
| `aiApi.ts` | AI service/native boundary helpers |

## Rules

- CDB card CRUD must still route through the document host protocol.
- `.dey` metadata APIs store editor-only state, never CDB facts or secrets.
- Task APIs should not pretend cancellation succeeded unless a real cancel handler exists.
