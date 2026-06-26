# src/lib/features/script-editor/

## Responsibility

Lua Script Editor Feature — Monaco-based Lua IDE used by the current-card Script surface and the legacy Lua workbench. It provides YGOPro-specific completion, diagnostics, semantic highlighting, reference manual, and code-to-image export.

## Design

### Architecture

The script editor is structured in three layers:
1. **Controller layer** — `controller.ts`, `useCases.ts`, `extraUseCases.ts` manage script buffers, internal script tabs, focus-aware save, and surface lifecycle
2. **Lua analysis layer** (`lua/`) — pure Lua analysis functions, no Monaco dependency
3. **Monaco integration** (`monaco/`) — bridges Lua analysis into Monaco editor providers

### Lua Analysis (`lua/`)

- **`catalog.ts`** — loads and indexes the Lua intellisense catalog (functions, constants, snippets) from generated data
- **`calls.ts`** — extracts function call sites from Lua AST (via `luaparse`)
- **`scope.ts`** — Lua scope analysis: variable resolution, function parameter tracking
- **`symbols.ts`** — symbol extraction: function definitions, variable assignments
- **`semantic.ts`** — semantic token classification for syntax highlighting
- **`diagnostics.ts`** — basic Lua diagnostics: undefined variables, unused locals, type mismatches
- **`reference.ts`** — reference manual lookup: function signatures, parameter docs, hover info

### Monaco Integration (`monaco/`)

- **`setup.ts`** — Monaco editor configuration: language registration, theme, keybindings
- **`completion.ts`** — completion provider: function names, constants, snippet expansion, `#`-prefix custom snippets

### Other

- **`runtime.ts`** — script editor runtime state management
- **`view.ts`** — view state serialization for tab switching
- **`scriptRenderer.ts`** — code-to-image export: renders Lua code with syntax highlighting as PNG

### Components

- `ScriptEditorCore.svelte` — Monaco editor wrapper with all providers
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
