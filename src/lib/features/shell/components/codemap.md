# src/lib/features/shell/components/

## Responsibility
App Shell UI Components — top-level app frame components for CDB workspace navigation and global/CDB-level commands.

## Components
- `AppTopBar.svelte` — main toolbar with open/create/tools/settings/theme/language; save lives in CDB tab menu/shortcuts/dirty flow
- `AppTabBar.svelte` — CDB workspace tab bar with close buttons and dirty indicators
- `FileDragOverlay.svelte` — overlay shown when dragging `.cdb` files over the window
- `RecentHistoryPopover.svelte` — dropdown showing recently opened CDB files

## Sub-map
- [dialogs/](dialogs/codemap.md)
