# src/lib/features/script-editor/components/

## Responsibility
Script Editor UI Components — Svelte components for the Lua editor interface.

## Components
- `ScriptEditorCore.svelte` — Monaco editor wrapper with all language providers configured
- `ScriptTabBar.svelte` — script file tab navigation
- `ScriptToolbar.svelte` — toolbar: save, export image, manual toggle, AI actions slot
- `ScriptSidePanel.svelte` — collapsible side panel for function/constant reference manual
- `ScriptHintOverlays.svelte` — floating function signature and parameter hints
- `ScriptReferenceOverlay.svelte` — full reference manual overlay
- `ScriptDiagnosticsOverlay.svelte` — diagnostics/warnings panel
- `ScriptEmptyState.svelte` — placeholder when no script is open
