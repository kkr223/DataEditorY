# src/lib/components/

## Responsibility

Shared UI Components — reusable/orchestrating Svelte components used across features and CDB workspace surfaces.

## Components

| Component | Purpose |
|-----------|---------|
| `CardEditor.svelte` | Main single-card editing panel — integrates form, image preview, footer actions, draft search, and surface contributions |
| `CardList.svelte` | Card Explorer list with quick search, advanced filters, chips, virtualized results, selection, and active card navigation |
| `LuaScriptEditor.svelte` | Lua script editor panel — integrates Monaco editor, toolbar, internal tab bar, side panel, overlays |
| `CardImageDrawer.svelte` | Legacy slide-out drawer hosting the card image maker; current main flow uses Image surface |
| `SetcodeField.svelte` | Setcode (archetype) input field with catalog lookup and autocomplete |
| `SettingsPanel.svelte` | Settings panel container |
| `Toast.svelte` | Toast notification display |

## Design

These components are "orchestrating components" — they compose feature-specific sub-components and connect them to stores. They serve as the glue between the module workbench layer and the feature controller layer.

## Integration

- **Consumed by**: module workbenches and CDB surfaces (`CardCollectionWorkbench`, `ScriptSurface`, `ImageSurface`, legacy `LuaWorkbench`)
- **Depends on**: features (controllers, components), stores, domain
