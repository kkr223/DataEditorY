# src/lib/features/script-editor/monaco/

## Responsibility
Monaco Editor Integration — bridges the Lua analysis engine into Monaco editor providers.

## Files
- `setup.ts` — Monaco editor configuration: Lua language registration, custom theme, keybindings (F9/F10 manual toggles), editor options
- `completion.ts` — completion provider: function name completion, constant completion, snippet expansion, `#`-prefix custom snippets from `snippets.json`
