# src/lib/stores/

## Responsibility

State Management Layer — Svelte 5 reactive stores managing application-wide and CDB workspace state. Provides the reactive data backbone for Card Explorer, drafts, scripts, settings, and shell UI.

## Design

Uses a mix of Svelte `writable` stores and Svelte 5 `$state` runes (files ending in `.svelte.ts`). Organized by concern:

### Database Stores

- **`tabs.ts`** — CDB workspace tab management: open/close/activate tabs, track dirty state, cached search results per CDB
- **`db.ts`** — barrel export aggregating all DB-related stores (tabs, search, undo, cardUtils, cardOperations, recentHistory)
- **`search.ts`** — Card Explorer search execution: builds queries from filters via `domain/search/query.ts`, executes via document host, caches paginated results
- **`cardOperations.ts`** — CRUD operations on cards: modify, delete, upsert via document host provider
- **`cardUtils.ts`** — card cloning and utility helpers
- **`cardClipboard.svelte.ts`** — copy/paste card buffer with multi-select support
- **`undo.ts`** — undo operation types and labels

### Editor Stores

- **`editor.svelte.ts`** — card editor/Card Explorer state: selected cards, filters, current page, active card, pagination, selection anchoring
- **`scriptEditor.svelte.ts`** — Lua script editor state: CDB-owned internal script tabs, active tab, content tracking, view state persistence

### App-Level Stores

- **`appShell.svelte.ts`** — shell layout, settings panel visibility, and compatibility view state
- **`appSettings.svelte.ts`** — user preferences: AI config, script template, package settings, language, cover image
- **`recentHistory.ts`** — recently opened CDB files (persisted via Rust settings)
- **`toast.svelte.ts`** — notification toast queue

## Files

| File | Purpose |
|------|---------|
| `tabs.ts` | CDB workspace tab lifecycle, dirty tracking, cached search state |
| `db.ts` | Barrel re-export of all DB stores |
| `search.ts` | Search query execution and result caching |
| `editor.svelte.ts` | Card editor reactive state (selection, filters, draft, pagination) |
| `scriptEditor.svelte.ts` | CDB-scoped internal script tab management and content state |
| `cardOperations.ts` | Card CRUD operations via document host |
| `cardUtils.ts` | Card cloning utilities |
| `cardClipboard.svelte.ts` | Card copy/paste buffer |
| `undo.ts` | Undo operation type definitions |
| `appShell.svelte.ts` | App view routing and layout state |
| `appSettings.svelte.ts` | User preferences store |
| `recentHistory.ts` | Recent CDB file history |
| `toast.svelte.ts` | Toast notification queue |

## Integration

- **Consumed by**: components, features, application layer
- **Depends on**: `infrastructure/tauri/` (IPC), `domain/` (business logic), `platform/` (document runtime)
