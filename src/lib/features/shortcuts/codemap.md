# src/lib/features/shortcuts/

## Responsibility

Keyboard Shortcut System — global keyboard shortcut registry and dispatch.

## Design

- **`registry.ts`** — registers all global shortcuts (`Ctrl+O`, `Ctrl+S`, `Ctrl+Z`, `Ctrl+N`, `Ctrl+Enter`, `Ctrl+F`, `Ctrl+C/V/D`, arrow keys) with their handlers. Shortcuts are context-aware: most are suppressed when focus is in an input element. Arrow key navigation only applies to the card editor view, not the Lua editor.

## Integration

- **Consumed by**: app shell initialization
- **Depends on**: `application/workspace/commandBus` (for save/open/create), stores (`editor`, `db`, `appShell`)
