# src/lib/features/workspace-search/

## Responsibility

CDB-scoped global text search and replacement. The middle rail places this surface after Image and before AI in extra, or after Script in base. CDB search/replacement is limited to card names and effect descriptions, plus `script/c{cardId}.lua` for those cards, using owned open buffers before disk.

## Files

- `SearchSurface.svelte`, `SearchPanel.svelte` — per-CDB search form, case/regex toggles, database/script scope, loading/error/empty states and warnings.
- `SearchResults.svelte` — collapsible card/file groups, field or line/column locations and escaped match highlighting.
- `SearchReplaceBar.svelte` — replacement input, explicit preview/apply, save guidance and affected-card/script counts. Result rows show escaped before/after snippets.
- `results.ts` — match identities, retained replacement targets, and reversible per-match/group exclusion for the current search only.
- `applyReplacement.ts`, `replacementApplication.ts` — preflight all script buffers, apply an atomic CDB compare-and-swap, and roll back only untouched buffers on failure. Scripts remain dirty buffers, with Monaco undo preserved; CDB changes remain in the working copy until saved.
- `types.ts` — request/result DTOs shared by the native adapter and UI.
- `controller.ts` — draft commit, request generations, cancellation and CDB revision checks. New input or leaving a workspace prevents late responses from replacing the current results.
- `state.ts` — in-memory controllers keyed by CDB session/path; closing a document releases its controller. Queries/results are not persisted to `.dey`.
- `navigation.ts` — uses the guarded card navigation flow, opens existing scripts without creating missing files, and queues a Monaco selection through `script-editor/revealLocation.ts`.
- `contextMenu.ts` — shared popup actions for result rows and group headers: draft-safe navigation, captured result text/card identity/path copying, and file reveal. Actions stay scoped to the originating CDB, search surface, and result snapshot; file-existence updates use menu tokens.

## Native boundary

`native/workspaceSearchApi.ts` sends `workspaceSearch` and `workspaceReplacePreview` through the document host protocol. Rust snapshots the live CDB via the encoder/repository session, releases its SQLite lock, then searches/plans replacements with one regex engine. Each category returns at most 500 matches; disk scripts above 4 MiB or unreadable scripts produce bounded warnings. Locations use Monaco's UTF-16 columns, and source fingerprints reject stale matches. Only remaining displayed matches enter the replacement preview, whose total changed content is capped at 16 MiB. Applying CDB changes uses the existing `upsert` command with full-card preconditions and undo; no original CDB or script files are written by the replacement action.
