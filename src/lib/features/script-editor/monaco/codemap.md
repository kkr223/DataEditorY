# src/lib/features/script-editor/monaco/

## Responsibility
Monaco Editor Integration — bridges the Lua analysis engine into Monaco editor providers.

## Files
- `setup.ts` — Monaco editor configuration: Lua language registration, custom theme, keybindings (F9/F10 manual toggles), editor options
- `completion.ts` — function completion helpers; `setup.ts` registers completion providers, merging built-in snippets with the current saved `scriptSnippets` user preference on each completion request
- `textModels.ts` — text-tab model ownership: retains models across editor unmounts, then clears Lua context and disposes the model when its tab closes or replaces the model after Save As.
