# src/lib/features/shell/

## Responsibility

Application Shell — manages the app frame, CDB-only top-level tabs, global/CDB-level commands, file operations, and tool dialogs.

## Design

### Controllers

- **`controller.ts`** — main shell orchestration: open/create CDB, drag-and-drop file handling, file association handling, recent history management, CDB tab switching
- **`layoutController.svelte.ts`** — app layout state, including workspace/sidebar sizing
- **`dialogsController.svelte.ts`** — dialog visibility state and helpers for CDB-level tool dialogs
- **`dialogsHelpers.ts`** — utility functions for dialog data preparation
- **`mergeController.ts`** — merge workflow: add sources, reorder, analyze, execute merge via platform commands
- **`packageController.ts`** — package workflow: ZIP/YPK export via platform commands
- **`filterCdbController.ts`** — create filtered CDB from current search results

### Components

- `AppTopBar.svelte` — toolbar with open/create/tools/settings/theme/language entries; save is not a permanent top-level button
- `AppTabBar.svelte` — CDB workspace tab bar with close/dirty indicators
- `FileDragOverlay.svelte` — drag-and-drop overlay for `.cdb` files
- `RecentHistoryPopover.svelte` — recently opened files dropdown
- `dialogs/MergeCdbDialog.svelte` — multi-source merge dialog with analysis preview
- `dialogs/CreateFilteredCdbDialog.svelte` — filtered CDB creation dialog
- `dialogs/BatchCdbEditDialog.svelte` — card group + operation group batch field edit with preview/confirmation
- `dialogs/LuaReplaceDialog.svelte` — include/exclude/regex/case-sensitive Lua search-replace with preview diff
- `dialogs/BatchImageExportDialog.svelte` — art directory + preset based batch export
- `dialogs/AssetCheckDialog.svelte` — CDB resource validation

## Integration

- **Consumed by**: `routes/+layout.svelte`, `routes/+page.svelte`, module workbenches
- **Depends on**: stores (`db`, `appShell`), platform runtime, typed native APIs
