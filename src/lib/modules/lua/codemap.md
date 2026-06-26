# src/lib/modules/lua/

## Responsibility
Lua Script Module — provides `.lua` file codec, in-memory script provider, Lua script workbench, and a contribution to the card workbench footer (open script button).

## Design
- `LUA_SCRIPT_TYPE` data type with content validation
- `LUA_MEMORY_PROVIDER_ID` — `MemoryDocumentProvider` (scripts are held in memory, saved to disk via codec)
- `.lua` codec reads/writes text files via `CodecContext`
- `lua.workbench` renders `LuaWorkbench.svelte`
- `lua.card-actions` contribution adds script actions to the card editor footer

## Integration
- **Depends on**: `card` module
- **Contributes to**: `card.workbench` (footer-actions slot)
