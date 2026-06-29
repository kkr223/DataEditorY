# src/lib/modules/

## Responsibility

Module Declaration Layer — defines and composes all `ExtensionModule` instances that plug into the platform runtime. CDB documents remain platform documents, while Script/Image/AI now appear primarily as surfaces inside the card CDB workspace.

## Design

### Variant Composition Pattern

The build system uses compile-time module switching:
- `base.ts` — registers: `settings`, `card`, `cdb`, `lua`, `package`, `merge`, `ai`
- `extra.ts` — extends base with: `card-image`
- `active.ts` — re-exports from either `base.ts` or `extra.ts` (rewritten at build time by `scripts/run-variant-build.mjs`)

The `__APP_MODULE_IDS__` compile-time constant (injected by Vite) lists active module IDs for runtime feature-gating.

### Module Dependency Graph

```
settings ←── card ←── cdb
               ↑        ↑
               ├── lua   ├── package
               │         └── merge
               ├── card-image (extra only)
               └── ai (depends on lua + settings)
```

## Modules

| Module | ID | Directory | Purpose |
|--------|----|-----------|---------|
| Settings | `settings` | `settings/` | App settings document type with in-memory provider and settings workbench |
| Card | `card` | `card/` | `ygo.card-collection` data type, CDB workspace workbench, Card Explorer, Card/Script/Image/AI surface host |
| CDB | `cdb` | `cdb/` | `.cdb` file codec, `TauriDocumentProvider` for Rust-backed CDB operations |
| Lua | `lua` | `lua/` | `.lua` file codec, in-memory script provider, Lua workbench, card-script contribution used by Script surface |
| Package | `package` | `package/` | Dependency-only module; ZIP/YPK packaging is routed through `native/taskApi` (`package.zip` kind) |
| Merge | `merge` | `merge/` | Dependency-only module; merge operations are routed through `native/taskApi` (`merge.collect-sources`, `merge.analyze`, `merge.execute` kinds) |
| Card Image | `card-image` | `card-image/` | Card image config type, JSON codec, image services/contributions used by Image surface (extra only) |
| AI | `ai` | `ai/` | AI session type, provider, AI service/contribution used by workspace AI surface |

## Integration

- **Consumed by**: `src/lib/platform/appRuntime.ts` (passes modules to `DocumentRuntime`)
- **Depends on**: `src/lib/platform/` (types, providers), `src/lib/infrastructure/tauri/` (commands, document host)
- **Tab rule**: top-level shell tabs should expose CDB workspaces only; child script/image/AI state is routed through the active CDB workspace.
- **Sub-maps**: [card/](card/codemap.md) | [cdb/](cdb/codemap.md) | [lua/](lua/codemap.md) | [settings/](settings/codemap.md) | [card-image/](card-image/codemap.md) | [ai/](ai/codemap.md) | [merge/](merge/codemap.md) | [package/](package/codemap.md)
