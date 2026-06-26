# src/lib/

## Responsibility

Frontend Application Code — the Svelte/TypeScript desktop IDE organized around CDB workspace tabs, Card Explorer navigation, and current-card surfaces.

## Directory Map

| Directory | Layer | Responsibility | Detailed Map |
|-----------|-------|---------------|--------------|
| `platform/` | Platform | Extension module runtime, document lifecycle, workbench hosting | [View](platform/codemap.md) |
| `modules/` | Module Registration | Module declarations and variant composition | [View](modules/codemap.md) |
| `domain/` | Domain | Pure business logic — card taxonomy, search, validation, batch operations, script tab identity | [View](domain/codemap.md) |
| `features/` | Feature | Feature controllers — shell tools, card editor, script editor, AI, card image, settings | [View](features/codemap.md) |
| `stores/` | State | Svelte reactive state for app, CDB sessions, search, scripts, settings | [View](stores/codemap.md) |
| `native/` | API Boundary | Typed frontend APIs for CDB, script, metadata, tasks, assets, settings, AI | [View](native/codemap.md) |
| `infrastructure/` | Infrastructure | Low-level Tauri IPC bridge and document host client | [View](infrastructure/codemap.md) |
| `application/` | Application | Workspace lifecycle and command bus | [View](application/codemap.md) |
| `core/` | Core | Workspace projection, CDB path identity, editor snapshots | [View](core/codemap.md) |
| `components/` | UI | Shared orchestrating Svelte components | [View](components/codemap.md) |
| `services/` | Service | Application services (scripts, images, AI context) | [View](services/codemap.md) |
| `utils/` | Utility | Helper functions and legacy Lua utilities | [View](utils/codemap.md) |
| `i18n/` | I18n | Chinese + English localization | [View](i18n/codemap.md) |
| `types/` | Types | Shared TypeScript type definitions | [View](types/codemap.md) |
| `config/` | Config | Build variant configuration constants | [View](config/codemap.md) |
| `actions/` | Actions | Svelte DOM actions | [View](actions/codemap.md) |
| `data/` | Data | Generated Lua intellisense catalog | — |
| `build-stubs/` | Build | Stub files for base variant feature exclusion | — |

## Layer Dependency Rules

```
routes → platform/workbench → modules → features → stores
                                  ↓          ↓        ↓
                             application → domain ← core
                                  ↓
                              native → infrastructure/tauri
```

Feature code should prefer `native/*Api.ts` over direct `invoke()`. CDB card CRUD still goes through the document host protocol.
