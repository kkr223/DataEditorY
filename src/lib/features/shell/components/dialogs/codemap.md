# src/lib/features/shell/components/dialogs/

## Responsibility
Shell Dialogs — modal dialogs for complex multi-step operations.

## Components
- `MergeCdbDialog.svelte` — multi-source CDB merge dialog: add/remove/reorder sources, analyze conflicts, execute merge with progress
- `CreateFilteredCdbDialog.svelte` — create a new CDB containing only the current search results
- `BatchCdbEditDialog.svelte` — one batch scope (selection/filter/saved group), ordered field edits, before/after preview, confirmation, apply; group management is collapsed
- `BatchFieldInput.svelte` — field-aware text/numeric inputs and named card type/race/attribute/permission choices
- `LuaReplaceDialog.svelte` — global Lua search/replace with include/exclude, regex, case-sensitive, preview diff, apply
- `BatchImageExportDialog.svelte` — batch card image export using art directory and preset; no batch image editing
- `AssetCheckDialog.svelte` — validates CDB-associated assets and reports missing/extra resources
