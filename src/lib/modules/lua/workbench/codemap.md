# src/lib/modules/lua/workbench/

## Responsibility
Lua Script Workbench — compatibility Lua editor workbench and card-script contribution. The primary current-card flow is `modules/card/workbench/ScriptSurface.svelte`.

## Components
- `LuaWorkbench.svelte` — hosts the `LuaScriptEditor` component with toolbar contribution slots
- `CardScriptContribution.svelte` — routes the active card to its Script surface / `c{id}.lua`
- `context.ts` — workbench context (script tab state, card association)
