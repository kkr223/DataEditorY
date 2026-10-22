# src/lib/features/script-editor/

## Responsibility

Lua Script Editor Feature — Monaco-based Lua IDE used by the current-card Script surface and the legacy Lua workbench. It provides YGOPro-specific completion, diagnostics, semantic highlighting, reference manual, and code-to-image export.

## Design

### Architecture

The script editor is structured in three layers:
1. **Controller layer** — `controller.ts`, `useCases.ts` manage script buffers, internal script tabs, focus-aware save, and surface lifecycle
2. **Lua analysis layer** (`lua/`) — pure Lua analysis functions, no Monaco dependency
3. **Monaco integration** (`monaco/`) — bridges Lua analysis into Monaco editor providers

### Lua Analysis (`lua/`)

- **`catalog.ts`** — loads the Lua intellisense catalog from generated data and installed resources; edited function entries override bundled definitions, with independent fallback for missing companion files
- **`calls.ts`** — extracts function call sites from Lua AST (via `luaparse`)
- **`semantic.ts`** — semantic analysis: scope chain, symbol extraction, call/hover resolution, token classification
- **`diagnostics.ts`** — basic Lua diagnostics: undefined variables, unused locals, type mismatches
- **`reference.ts`** — reference manual lookup: function signatures, parameter docs, hover info

### Monaco Integration (`monaco/`)

- **`setup.ts`** — Monaco editor configuration: language registration, theme, keybindings
- **`completion.ts`** — completion provider: function names, constants, snippet expansion, `#`-prefix custom snippets

### Other

- **`contextMenu.ts`** — localized Monaco editing actions and selected-code image copying
- **`tabMenu.ts`** — scoped Lua tab save/reload/external-open/card-navigation/split/close actions
- **`splitRuntime.ts`** — two editable Monaco panes or an editable side-by-side diff; reuses models and view state, tracks focused save targets, and aligns/synchronizes comparison scrolling
- **`splitState.ts`** — in-memory script pairs owned by CDB session; cleared when either member closes
- **`runtime.ts`** — Monaco lifecycle, Ctrl/Cmd + wheel and keyboard font zoom; line height scales with font size and Ctrl/Cmd + 0 restores the current saved default
- **`fontPreferences.ts`** — default font size (14 px), shared 8–32 px bounds, and preference normalization
- **`snippetPreferences.ts`** — custom snippet parsing/validation, settings editing format, and live merging with built-in snippets; user settings replace bundled custom entries, including an intentionally empty list
- **`view.ts`** — view state serialization for tab switching
- **`scriptRenderer.ts`** — code-to-image export: renders Lua code with syntax highlighting as PNG

### Components

- `ScriptEditorCore.svelte` — Monaco editor wrapper with all providers
  Script models use LF and compare normalized content before replacement so Windows CRLF differences do not reset snippet tab stops or cursor selections.
- `SplitScriptEditor.svelte` — dual-pane host with a comparison switch; omits the single-script toolbar and description/hint sidebar
- `ScriptTabBar.svelte` — script tab navigation
- `ScriptToolbar.svelte` — toolbar with save, export, manual buttons
- `ScriptSidePanel.svelte` — side panel for function/constant manual
- `ScriptHintOverlays.svelte` — floating function signature hints
- `ScriptReferenceOverlay.svelte` — reference manual overlay panel
- `ScriptDiagnosticsOverlay.svelte` — diagnostics panel
- `ScriptEmptyState.svelte` — empty state when no script is open

## Integration

- **Consumed by**: `modules/card/workbench/ScriptSurface.svelte`, `modules/lua/workbench/LuaWorkbench.svelte`
- **Depends on**: `luaparse` (AST parsing), `monaco-editor`, stores (`scriptEditor`), domain (`script/workspace`), services
