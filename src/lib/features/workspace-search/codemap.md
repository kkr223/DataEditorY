# src/lib/features/workspace-search/

## Responsibility

CDB-scoped global text search. The middle rail places this surface after Image and before AI in extra, or after Script in base. It searches all persisted card fields in the current working copy and `script/c{cardId}.lua` for those cards, using owned open buffers before disk.

## Files

- `SearchSurface.svelte`, `SearchPanel.svelte` — per-CDB search form, case/regex toggles, database/script scope, loading/error/empty states and warnings.
- `SearchResults.svelte` — collapsible card/file groups, field or line/column locations and escaped match highlighting.
- `types.ts` — request/result DTOs shared by the native adapter and UI.
- `controller.ts` — draft commit, request generations, cancellation and CDB revision checks. New input or leaving a workspace prevents late responses from replacing the current results.
- `state.ts` — in-memory controllers keyed by CDB session/path; closing a document releases its controller. Queries/results are not persisted to `.dey`.
- `navigation.ts` — uses the guarded card navigation flow, opens existing scripts without creating missing files, and queues a Monaco selection through `script-editor/revealLocation.ts`.
- `contextMenu.ts` — shared popup actions for result rows and group headers: draft-safe navigation, captured result text/card identity/path copying, and file reveal. Actions stay scoped to the originating CDB, search surface, and result snapshot; file-existence updates use menu tokens.

## Native boundary

`native/workspaceSearchApi.ts` sends `workspaceSearch` through the document host protocol. Rust snapshots the live CDB via the encoder/repository session, releases its SQLite lock, then searches fields and scripts with one regex engine. Each category returns at most 500 matches; disk scripts above 4 MiB or unreadable scripts produce bounded warnings. Locations use Monaco's UTF-16 columns.
