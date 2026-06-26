# Repository Atlas: DataEditorY

## Project Responsibility

DataEditorY is a cross-platform desktop IDE for creating and editing YGOPro `.cdb` card databases. It is built with **Tauri 2** (Rust backend) and **Svelte 5 + TypeScript** (frontend).

The current product model is **CDB-first**:

```text
Top bar: global and CDB-level commands
CDB tabs: one tab per opened database workspace
Left: Card Explorer with search/filter/results
Middle rail: current-card surfaces
Main area: Card / Script / Image / AI surface
```

Top-level app tabs represent CDB workspaces only. Lua scripts, card images, and AI are surfaces under the active CDB and active card context.

**Version**: 2.5.0
**Author**: kkr223
**License**: MIT
**Variants**: `base` (CDB editing + AI) | `extra` (+ card image maker)

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend Framework | Svelte 5 + SvelteKit SPA |
| Frontend Language | TypeScript |
| Build Tool | Vite 6 |
| Desktop Runtime | Tauri 2 |
| Backend Language | Rust 2021 |
| CDB Encoding | `ygopro-cdb-encode-rs` / `cdb-encoder-rs` through repository/session layers |
| Code Editor | Monaco Editor |
| Card Renderer | `yugioh-card-ts` + Leafer canvas |
| I18n | `svelte-i18n` |
| Package Manager | Bun |

## System Architecture

```text
Frontend (Svelte 5 + TypeScript)
  routes/
    +layout.svelte         app shell, CDB tab filtering, global shortcuts
    +page.svelte           WorkbenchHost entry
  platform/                extension registry and document runtime
  modules/                 base/extra module composition
  modules/card/workbench/  CDB workspace: explorer + Card/Script/Image/AI surfaces
  features/                feature controllers and UI dialogs
  domain/                  pure card/search/script logic
  core/workspace/          workspace projection, CDB path identity, snapshots
  native/                  typed Tauri/native API wrappers
  infrastructure/tauri/    document host protocol and low-level invoke bridge

Backend (Rust)
  commands/                Tauri command handlers
  document_host/           CDB document protocol: search, undo, card mutations
  services/                sessions, metadata, package, merge, Lua replace, asset checks
  repository/              CDB read/write through ygopro-cdb-encode-rs
  session/                 working-copy lifecycle
```

### Data Flow

```text
Open CDB
  shell command
  -> DocumentRuntime / CDB provider
  -> Rust session creates temp working copy
  -> .dey metadata loaded from CDB directory
  -> Card Explorer receives initial search page

Edit card
  Card surface form
  -> frontend draft state
  -> validation
  -> commit patch to document host working copy
  -> CDB workspace dirty flag
  -> saveSession atomically writes working copy to original .cdb

Edit script
  Script surface opens c{id}.lua for active card
  -> internal script tabs inside the CDB workspace
  -> Ctrl+S saves focused script buffer, not the CDB tab

Edit image config
  Image surface maps active card draft to yugioh-card-ts model
  -> per-card overrides saved in .dey metadata
  -> .cdb remains unchanged

Use AI
  AI surface runs a workspace-level agent over opened CDB context
  -> Agent can read CDB/card/script/image context and create sandbox proposals in .dey
  -> AI surface shows tool calls, skill usage, proposal patches, and apply status
  -> user confirmation applies proposal patches to the CDB working copy, scripts, or image metadata
```

## Key Architectural Patterns

1. **CDB workspace tabs** — App-level tabs are CDB workspaces. Surface tabs (`Card`, `Script`, `Image`, `AI`) live inside the active CDB workspace.

2. **Card Explorer as navigation** — Search, advanced filters, filter chips, virtualized results, selected cards, and active card are workspace state. `filteredResultSet`, `selectedCards`, and `activeCard` are distinct.

3. **Draft / apply / save** — Field edits update a frontend draft first. Valid draft changes commit to the CDB working copy before card switches and CDB saves. Severe validation blocks commit; warnings can still commit.

4. **Working copy pattern** — Open CDBs are copied to temp storage. Mutations affect the working copy. Explicit save writes atomically to the original path.

5. **Document host for CDB CRUD** — CDB search, card mutations, undo, and save operations go through `infrastructure/tauri/documentHost.ts` and `src-tauri/src/document_host/`.

6. **Typed native APIs** — Frontend feature code should use `src/lib/native/*Api.ts` wrappers instead of direct scattered `invoke()` calls.

7. **Workspace metadata** — Editor-only state is saved under `.dey/{cdb-stem}.workspace.json` beside the CDB. Metadata stores UI layout, explorer filters, card groups, image overrides, AI threads/proposals/tool logs, opened script tabs, and task history.

8. **Library-first rendering and CDB encoding** — Card image rendering uses `yugioh-card-ts`. CDB read/write uses `ygopro-cdb-encode-rs` / `cdb-encoder-rs`; app code does not implement the CDB file format.

9. **Auditable AI proposals** — AI is workspace-level. It can inspect context and generate proposals, but direct writes require user confirmation.

10. **Variant composition** — `scripts/run-variant-build.mjs` rewrites `src/lib/modules/active.ts` during builds. Do not manually edit `active.ts`.

## System Entry Points

| File | Purpose |
|------|---------|
| `src/routes/+layout.svelte` | Root app shell, CDB-only top-level tab projection, file association events |
| `src/routes/+page.svelte` | SPA page entry, renders `WorkbenchHost` |
| `src/lib/platform/appRuntime.ts` | Creates singleton `DocumentRuntime` with active modules |
| `src/lib/modules/card/workbench/CardCollectionWorkbench.svelte` | Main CDB workspace layout |
| `src/lib/modules/card/workbench/CardSurfaceRail.svelte` | Current-card surface switcher |
| `src/lib/modules/card/workbench/ScriptSurface.svelte` | Script surface and internal script tabs |
| `src/lib/modules/card/workbench/ImageSurface.svelte` | Card image model surface |
| `src/lib/modules/card/workbench/AiSurface.svelte` | Workspace AI surface and proposal review |
| `src/lib/native/` | Typed frontend API boundary |
| `src-tauri/src/main.rs` | Rust binary entry |
| `src-tauri/src/lib.rs` | Tauri app setup, plugins, command handlers |
| `scripts/run-variant-build.mjs` | Variant build orchestrator |

## Directory Map

### Frontend (`src/`)

| Directory | Responsibility | Detailed Map |
|-----------|----------------|--------------|
| `src/lib/platform/` | Extension module registry, runtime, document lifecycle, workbench host | [View](src/lib/platform/codemap.md) |
| `src/lib/modules/` | Module declarations and base/extra composition | [View](src/lib/modules/codemap.md) |
| `src/lib/modules/card/workbench/` | CDB workspace, Card Explorer, surface rail, Card/Script/Image/AI surfaces, workspace metadata state | [View](src/lib/modules/card/workbench/codemap.md) |
| `src/lib/domain/` | Pure card/search/script logic: validation, batch operations, draft helpers, query building, script tab identity | [View](src/lib/domain/codemap.md) |
| `src/lib/core/` | Workspace projections, CDB path identity, editor snapshots | [View](src/lib/core/codemap.md) |
| `src/lib/features/` | Feature controllers, dialogs, shell actions, editor use cases | [View](src/lib/features/codemap.md) |
| `src/lib/native/` | Typed APIs: CDB, script, asset, metadata, task, settings, AI |
| `src/lib/infrastructure/` | Low-level Tauri bridge and document host IPC | [View](src/lib/infrastructure/codemap.md) |
| `src/lib/application/` | Workspace lifecycle and command bus orchestration | [View](src/lib/application/codemap.md) |
| `src/lib/components/` | Shared UI components such as `CardEditor`, `CardList`, `LuaScriptEditor` | [View](src/lib/components/codemap.md) |
| `src/lib/stores/` | Reactive app/workspace stores | [View](src/lib/stores/codemap.md) |
| `src/lib/services/` | Frontend services: script, card image, AI context, setcode catalog | [View](src/lib/services/codemap.md) |
| `src/lib/i18n/` | Chinese and English localization | [View](src/lib/i18n/codemap.md) |
| `src/lib/data/` | Generated Lua intellisense catalog; do not edit generated output |
| `src/routes/` | SvelteKit SPA routes | [View](src/routes/codemap.md) |

### Backend (`src-tauri/`)

| Directory | Responsibility | Detailed Map |
|-----------|----------------|--------------|
| `src-tauri/src/commands/` | Tauri command handlers for metadata, tasks, assets, Lua replace, settings, package/merge | [View](src-tauri/src/commands/codemap.md) |
| `src-tauri/src/document_host/` | CDB document protocol: search compilation, undo, working-copy card CRUD | [View](src-tauri/src/document_host/codemap.md) |
| `src-tauri/src/services/` | Rust services: CDB session, metadata `.dey`, package, merge, Lua replace, asset checks | [View](src-tauri/src/services/codemap.md) |
| `src-tauri/src/session/` | CDB connection and temp working-copy lifecycle | [View](src-tauri/src/session/codemap.md) |
| `src-tauri/src/repository/` | CDB repository using `ygopro-cdb-encode-rs` | [View](src-tauri/src/repository/codemap.md) |
| `src-tauri/src/models/` | Rust DTOs shared by commands/services | [View](src-tauri/src/models/codemap.md) |

### Build System

| Directory | Responsibility | Detailed Map |
|-----------|----------------|--------------|
| `scripts/` | Variant switching, builds, Lua intellisense generation, CI helpers | [View](scripts/codemap.md) |

## Feature Summary

### Base Features

- **CDB tabs**: open/create/close/save multiple CDB workspaces; top-level tabs are databases only.
- **Card Explorer**: quick search, advanced filters, chips, colored type display, virtualized large-list browsing.
- **Single-card editor**: existing editor layout retained; edits flow through draft validation and working-copy commits.
- **DEX-style draft search**: `从草稿搜索` builds Card Explorer filters from the current draft.
- **Selection and groups**: selection is separate from active card and filtered results; card groups are metadata-backed task inputs.
- **Batch tools**: CDB field batch edit, Lua search/replace with diff preview, asset check, merge, package.
- **Script surface**: active card opens `c{id}.lua`; internal script tabs stay inside the CDB workspace.
- **Metadata**: `.dey/{cdb-stem}.workspace.json` persists editor-only state without polluting `.cdb`.
- **Internationalization**: Chinese and English UI.

### Extra Features

- **Image surface**: current-card card image preview/config/export backed by `yugioh-card-ts`; per-card config stored in `.dey`.
- **Batch image export**: top-level tool using art directory + preset; no batch image editing model.

## Development

```bash
bun install                    # Install dependencies
bun run dev                    # Frontend dev (default: extra)
bun run dev:base               # Frontend dev (base variant)
bun run tauri:dev              # Desktop dev (extra)
bun run tauri:build            # Desktop build (extra)
bun run tauri:build:all        # Build both variants
bun run check:base             # Svelte/TS check for base variant
bun run check:extra            # Svelte/TS check for extra variant
bun test                       # Frontend/domain tests
cargo test --manifest-path src-tauri/Cargo.toml
```

Dev server: `127.0.0.1:43127` (HMR port: `43128`)

## Verification Baseline

Recent full validation for the rewrite:

- `bun test`
- `bun run check:base`
- `bun run check:extra`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `bun run build:base`
- `bun run build:extra`
- `git diff --check`
