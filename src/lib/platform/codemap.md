# src/lib/platform/

## Responsibility

Application Platform Layer — provides the extension module runtime, document lifecycle management, and workbench hosting infrastructure. CDB workspaces are hosted through this layer; Script/Image/AI are also registered for compatibility and variant composition but are normally reached as surfaces inside the active CDB workspace.

## Design

### Extension Module System

Each feature registers as an `ExtensionModule` (`types.ts:148`) containing:
- **DataTypes** — schema definitions with validation and migration
- **Providers** — data access implementations (Tauri IPC or in-memory)
- **Codecs** — file format encode/decode (`.cdb`, `.lua`, `.json`)
- **Workbenches** — Svelte UI components for each document type
- **Commands** — named operations (merge, package export)
- **Services** — singleton service instances
- **SettingsSections** — pluggable settings UI panels
- **WorkbenchContributions** — injected UI contributions into other workbenches (e.g., AI buttons in card editor)

### Key Classes

- **`ExtensionRegistry`** (`registry.ts`) — collects all module registrations, validates dependencies and cross-references, provides lookup methods (`findCodecForSource`, `findWorkbench`, `findWorkbenchContributions`)
- **`DocumentRuntime`** (`runtime.ts`) — manages the full document lifecycle: `openSource` → `query`/`execute` → `save` → `close`. Tracks dirty state, revision numbers, undo support. Uses Svelte-compatible subscription pattern.
- **`MemoryDocumentProvider`** (`memoryProvider.ts`) — in-memory provider for documents that don't need Rust backend (Lua scripts, settings, card image config)
- **`PersistentMemoryProvider`** (`persistentMemoryProvider.ts`) — localStorage-backed provider for compatibility/persistent in-memory documents

### Workbench Hosting

- **`WorkbenchHost.svelte`** (`components/WorkbenchHost.svelte`) — renders the active document's workbench component
- **`WorkbenchContributions.svelte`** (`components/WorkbenchContributions.svelte`) — renders slot-based contributions into workbenches
- **`SettingsSections.svelte`** (`components/SettingsSections.svelte`) — renders all registered settings sections

## Flow

1. App boots → `appRuntime.ts` creates `DocumentRuntime` with active modules and a `CodecContext` backed by Tauri IPC
2. User opens a `.cdb` file → `runtime.openSource()` → registry finds CDB codec → codec decodes → provider opens (Tauri IPC to Rust) → CDB document record created
3. UI renders via `WorkbenchHost` → CDB workbench lazy-loads and hosts Card Explorer + surfaces
4. User edits → `runtime.execute()` → provider forwards command to Rust → revision incremented → dirty flag set
5. User saves → `runtime.save()` → codec encodes → writes to disk

## Files

| File | Purpose |
|------|---------|
| `types.ts` | All platform type definitions — DocumentRecord, ExtensionModule, DataProvider, CodecDescriptor, WorkbenchDescriptor, etc. |
| `registry.ts` | `ExtensionRegistry` class — module registration, validation, lookup |
| `runtime.ts` | `DocumentRuntime` class — document lifecycle (open, query, execute, save, close, undo) |
| `memoryProvider.ts` | In-memory `DataProvider` implementation |
| `persistentMemoryProvider.ts` | localStorage-backed `DataProvider` for compatibility/persistent in-memory documents |
| `filePatterns.ts` | File pattern matching utilities for codec resolution |
| `workbenchActions.ts` | Workbench-level action helpers |
| `appRuntime.ts` | Singleton `DocumentRuntime` instance with Tauri-backed `CodecContext` |
| `store.svelte.ts` | Svelte reactive store bridging workspace state |
| `index.ts` | Barrel re-export |

## Integration

- **Consumed by**: modules (`src/lib/modules/`), application layer (`src/lib/application/`), features, stores
- **Depends on**: `src/lib/infrastructure/tauri/` (for `CodecContext` in `appRuntime.ts`), `src/lib/modules/active` (for module list)
