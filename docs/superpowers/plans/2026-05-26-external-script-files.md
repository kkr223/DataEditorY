# External Script Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow `.lua`, `.txt`, and `.conf` files to open through startup arguments or drag/drop and edit/save them in the existing script editor.

**Architecture:** Keep CDB opening unchanged and add a second script workspace source for direct files. Tauri classifies startup paths and exposes text read/write commands; the Svelte shell classifies drag/drop paths and routes external script files into script tabs that save back to their original path.

**Tech Stack:** Tauri 2, Rust, Svelte 5, TypeScript, Bun tests, Cargo tests.

---

### Task 1: Path Classification Tests

**Files:**
- Modify: `src/lib/features/shell/controller.test.ts`
- Modify: `src/lib/features/shell/controller.ts`

- [ ] Add tests proving `.cdb` remains supported and `.lua`, `.txt`, `.conf` are classified as text/script files.
- [ ] Run `bun test src/lib/features/shell/controller.test.ts` and verify the new tests fail because the helper does not exist yet.
- [ ] Add `isExternalTextFilePath()` and `classifyExternalOpenPaths()` with dedupe.
- [ ] Run `bun test src/lib/features/shell/controller.test.ts` and verify it passes.

### Task 2: Startup Path Classification

**Files:**
- Modify: `src-tauri/src/services/media/system.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/app.rs`
- Modify: `src/lib/infrastructure/tauri/commands.ts`

- [ ] Add Rust tests proving startup args collect both CDB and external text paths while filtering unsupported files.
- [ ] Run `cargo test services::media::system::tests::collects_external_open_paths_from_args` from `src-tauri` and verify it fails because the collector does not exist yet.
- [ ] Add `ExternalOpenPaths { cdb_paths, text_paths }` and collect `.lua`, `.txt`, `.conf` files.
- [ ] Replace pending CDB-only state with pending external open path state and emit a new event carrying both lists.
- [ ] Keep command compatibility by returning both lists to TypeScript through `consume_pending_external_open_paths`.
- [ ] Run the targeted cargo test and verify it passes.

### Task 3: External File Read/Write Commands

**Files:**
- Modify: `src-tauri/src/services/media/io.rs`
- Modify: `src-tauri/src/services/media/mod.rs`
- Modify: `src-tauri/src/commands/media.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/infrastructure/tauri/commands.ts`

- [ ] Add Rust service tests for reading and writing allowed external text files.
- [ ] Run the targeted cargo test and verify it fails because the functions are missing.
- [ ] Implement `read_external_text_file(path)` and `write_external_text_file(path, content)` using absolute path, extension, file size, parent creation, and UTF-8 checks.
- [ ] Expose `read_external_text_file` and `save_external_text_file` Tauri commands and TypeScript wrappers.
- [ ] Run the targeted cargo tests and verify they pass.

### Task 4: Script Tab Source Support

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/stores/scriptEditor.svelte.ts`
- Modify: `src/lib/services/cardScriptService.ts`
- Modify: `src/lib/core/workspace/projection.ts`

- [ ] Add script store tests if a suitable store test harness exists; otherwise rely on shell helper tests plus Svelte type/check verification because the current store uses Svelte runtime state.
- [ ] Add `sourceKind: 'card' | 'file'` to `ScriptWorkspaceState`.
- [ ] Add `openExternalScriptFileWorkspace(path)` that reads a direct file, dedupes by `scriptPath`, and creates a script tab without CDB/card context.
- [ ] Branch save/reload behavior so card tabs use CDB commands and file tabs use text file commands.
- [ ] Update tab display names and workspace projection so external file tabs show the original file name and path.

### Task 5: Shell Routing and UI Gating

**Files:**
- Modify: `src/lib/features/shell/layoutController.svelte.ts`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/lib/components/LuaScriptEditor.svelte`
- Modify: `src/lib/features/script-editor/useCases.ts`
- Modify: `src/lib/features/script-editor/components/ScriptToolbar.svelte`
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/zh.json`

- [ ] Route startup and drag/drop CDB paths to `openCdbPath()` and external text/script paths to `openExternalScriptFileWorkspace()`.
- [ ] Update drag overlay text to mention CDB and supported text/script files.
- [ ] For file tabs, hide or disable card-dependent actions: AI generation, script image export, and card strings side panel.
- [ ] Keep diagnostics, reference insertion, reload, save, and open externally available for file tabs.
- [ ] Run `bun test`, `bun run check`, and `cargo test` for verification.
