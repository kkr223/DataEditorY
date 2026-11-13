# src/lib/platform/

## Responsibility

Application Platform Layer — provides the extension module runtime, document lifecycle management, and workbench hosting infrastructure. CDB workspaces are hosted through this layer; Script/Image/AI are also registered for compatibility and variant composition but are normally reached as surfaces inside the active CDB workspace.

## Design

### Extension Module System

Each feature registers as an `ExtensionModule` (`types.ts:148`) containing:
- **DataTypes** — schema definitions with validation and migration
- **Providers** — data access implementations (document host transport or in-memory)
- **Codecs** — file format encode/decode (`.cdb`, `.lua`, `.json`)
- **Workbenches** — Svelte UI components for each document type
- **SettingsSections** — pluggable settings UI panels
- **WorkbenchContributions** — injected UI contributions into other workbenches (e.g., AI buttons in card editor)
- **GlobalTools** — top-level tool dialogs (e.g., batch image export)
- **TaskRunners** — long-running background tasks routed through `native/taskApi`

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

1. App boots → `appRuntime.ts` creates the active `DocumentHostTransport` and `DocumentRuntime` with active modules and a `CodecContext`
2. User opens a `.cdb` file → `runtime.openSource()` → registry finds CDB codec → codec decodes → provider opens through the transport → CDB document record created
3. UI renders via `WorkbenchHost` → CDB workbench lazy-loads and hosts Card Explorer + surfaces
4. User edits → `runtime.execute()` → provider forwards command to Rust → revision incremented → dirty flag set
5. User saves → `runtime.save()` → provider saves (document host) or codec encodes → writes to storage

Saves are serialized per document and acknowledge the revision captured before encoding. Edits made during a save remain dirty; close waits for queued saves before disposing the provider.

`createDocument` accepts an optional destination for an initial save. It publishes the document after that save succeeds and disposes provider data if saving fails or creation is cancelled.

## Files

| File | Purpose |
|------|---------|
| `types.ts` | All platform type definitions — DocumentRecord, ExtensionModule, DataProvider, CodecDescriptor, WorkbenchDescriptor, etc. |
| `registry.ts` | `ExtensionRegistry` class — module registration, validation, lookup |
| `runtime.ts` | `DocumentRuntime` class — document lifecycle (open, query, execute, save, close, undo); `moveDocument` changes tab order without changing document data, dirty state, or activation |
| `memoryProvider.ts` | In-memory `DataProvider` implementation |
| `persistentMemoryProvider.ts` | localStorage-backed `DataProvider` for compatibility/persistent in-memory documents |
| `filePatterns.ts` | File pattern matching utilities for codec resolution |
| `appRuntime.ts` | Singleton `DocumentRuntime`, active transport, and `CodecContext` |
| `transport/` | `DocumentHostTransport` interface, Tauri transport, provider adapter (see `transport/codemap.md`) |
| `store.svelte.ts` | Svelte reactive store bridging workspace state |
| `index.ts` | Barrel re-export |

## Integration

- **Consumed by**: modules (`src/lib/modules/`), application layer (`src/lib/application/`), features, stores
- **Depends on**: `src/lib/infrastructure/tauri/` (Tauri transport + `CodecContext` in `appRuntime.ts`), `src/lib/modules/active` (module list factory)
