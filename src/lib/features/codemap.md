# src/lib/features/

## Responsibility

Feature Controllers Layer — implements presentation logic for the shell, card editor, script editor, image rendering, AI, settings, and CDB-level tools. Controllers coordinate stores, domain logic, platform runtime, and typed native APIs.

## Design

Features follow a consistent pattern:
- `controller.ts` — main orchestration logic
- `useCases.ts` — individual use case functions
- `extraUseCases.ts` — use cases only available in `extra` variant
- `lifecycle.ts` — initialization and cleanup hooks
- `components/` — feature-specific Svelte components

## Sub-Features

| Feature | Directory | Purpose |
|---------|-----------|---------|
| Shell | `shell/` | App frame: top bar, CDB-only tab bar, file drag overlay, recent history, CDB-level tool dialogs |
| Card Editor | `card-editor/` | Single-card editor, draft/search controller, validation, DEX-style draft search, image/script/AI surface entry points |
| Script Editor | `script-editor/` | Lua editor with Monaco: completion, diagnostics, semantic tokens, symbol navigation, reference manual, script save flow |
| Card Image | `card-image/` | `yugioh-card-ts` model mapping, canvas rendering, export helpers, layout logic (extra only) |
| AI | `ai/` | Workspace AI service, context building, tool boundary, auditable proposal generation |
| Settings | `settings/` | Settings UI: AI config, template, shortcuts, package, cover image |
| Shortcuts | `shortcuts/` | Keyboard shortcut registry and handler |

## Integration

- **Consumed by**: modules (via workbench components), routes
- **Depends on**: stores, domain, services, platform, native APIs
- **Sub-maps**: [shell/](shell/codemap.md) | [card-editor/](card-editor/codemap.md) | [script-editor/](script-editor/codemap.md) | [card-image/](card-image/codemap.md) | [ai/](ai/codemap.md) | [settings/](settings/codemap.md) | [shortcuts/](shortcuts/codemap.md)
