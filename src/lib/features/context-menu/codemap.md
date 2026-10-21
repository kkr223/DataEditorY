# src/lib/features/context-menu/

## Responsibility

Shared context-menu presentation and card-list actions for both application variants.

## Files

- `menu.svelte.ts` — menu state, captured owner/focus, token-guarded asynchronous updates, action error handling.
- `ContextMenu.svelte` — viewport-clamped popup with disabled/destructive items, arrow-key navigation, Escape dismissal and focus restoration.
- `cardMenu.ts` — single/multiple card and blank-space actions, file-existence checks and draft-safe navigation.
- `cardTargets.ts` — pure target selection and ordered database-close planning, covered by regression tests.
- `textMenu.ts` — ordinary input/textarea/contenteditable editing; preserves selection before moving focus into the menu. Monaco keeps its own menu.
- `cardTools.svelte.ts`, `CardMenuTools.svelte` — captured card selection routed to existing batch/group editing and showcase dialogs.

## Boundaries

Registered by `modules/context-menu` and hosted by the shell layout. Card CRUD reuses `card-editor/selectionActions` and the document host. File reveal uses `native/assetApi`. Context menus for CDB tabs live in `shell/components/AppTabBar.svelte`; Lua tab/editor actions live in `script-editor/`. Card-maker actions are available only when the image surface is registered. Image-area and AI-specific menus are outside this feature.
