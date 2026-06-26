# AGENTS.md

## Repository Map

A full codemap is available at `codemap.md` in the project root.

Before working on any task, read `codemap.md` to understand:
- Project architecture and entry points
- Directory responsibilities and design patterns
- Data flow and integration points between modules

For deep work on a specific folder, also read that folder's `codemap.md`.

## Key Architecture Notes

- **Variant system**: The project builds two variants (`base` and `extra`). The `src/lib/modules/active.ts` file is rewritten at build time to import from either `base.ts` or `extra.ts`. Do not manually edit `active.ts` — it is managed by the build scripts.
- **Extension modules**: Features are registered as `ExtensionModule` instances in `src/lib/modules/`. To add a new feature, create a new module and register it in the appropriate variant entry file.
- **CDB-first workspace**: Top-level app tabs represent CDB workspaces only. Card, Script, Image, and AI are current-card surfaces inside a CDB workspace, not peer document tabs.
- **Card Explorer navigation**: The left Card Explorer is the primary navigation surface. It owns quick search, advanced filters, active filter chips, virtualized card results, selection, and active-card changes.
- **Draft / apply / save**: Card field edits first update the frontend draft. Valid draft changes are committed to the CDB working copy before card switches and CDB saves. Severe validation errors block commit; warnings do not.
- **Document protocol**: CDB operations go through the document host protocol (`infrastructure/tauri/documentHost.ts` → `src-tauri/src/document_host/`). Do not bypass this with direct Tauri commands for card CRUD.
- **Working copy pattern**: Open CDBs are copied to a temp directory. Never write directly to the user's file — always go through the session/save pipeline.
- **CDB encoding**: CDB read/write and export paths must use `ygopro-cdb-encode-rs` / `cdb-encoder-rs` through the repository and session layers. Do not reimplement the CDB format in app code.
- **Workspace metadata**: Editor-only state belongs in `.dey/{cdb-stem}.workspace.json` beside the CDB. Do not store card facts, script file contents, image binaries, API keys, or large caches in `.dey`.
- **Native API boundary**: Frontend code should call typed APIs in `src/lib/native/` instead of scattered direct `invoke()` calls. CDB card CRUD still routes through the document host protocol.
- **AI boundary**: AI is a workspace-level surface. AI actions create auditable proposals with context/tool summaries; they must not directly write CDB data, scripts, or image metadata before user confirmation.
- **Generated files**: `src/lib/data/lua-intel/catalog.generated.ts` is auto-generated from `static/resources/`. Edit the source files, not the generated output.
