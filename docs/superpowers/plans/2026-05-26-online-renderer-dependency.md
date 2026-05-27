# Online Renderer Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the online `kkr223/ygo-card-renderer-rs` repository instead of a local sibling checkout, including release workflow resource setup.

**Architecture:** Cargo consumes `ygo-card-renderer-rs` from GitHub `main`. Renderer bundle resources are built from an online renderer checkout into `src-tauri/resources/yugioh_bundle.bin`, which Tauri bundles for the extra variant and CI prepares before building.

**Tech Stack:** Cargo git dependencies, Tauri resources, GitHub Actions, Node scripts.

---

### Task 1: Resource Path Test

**Files:**
- Modify: `scripts/build-variant-config.test.mjs`
- Modify: `scripts/build-variant-config.mjs`

- [ ] Add a test that extra variant uses `resources/yugioh_bundle.bin` and never references `../../ygo-card-renderer-rs`.
- [ ] Run the test and verify it fails.
- [ ] Update `CARD_IMAGE_BUNDLE_RESOURCE` to `resources/yugioh_bundle.bin`.
- [ ] Run the test and verify it passes.

### Task 2: Cargo and Runtime Paths

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/services/card_render/bundle.rs`
- Modify: `src-tauri/src/services/card_render/mod.rs`

- [ ] Change `ygo-card-renderer-rs` dependency from local path to `git = "https://github.com/kkr223/ygo-card-renderer-rs"`.
- [ ] Update Tauri resources and test bundle lookup to `src-tauri/resources/yugioh_bundle.bin`.
- [ ] Run `cargo update -p ygo-card-renderer-rs` from `src-tauri` to update lockfile.

### Task 3: Bundle Download Script and Workflow

**Files:**
- Create: `scripts/download-renderer-bundle.mjs`
- Modify: `.gitignore`
- Modify: `.github/workflows/release.yml`
- Modify: `package.json`

- [ ] Add `download:renderer-bundle` script that clones the online renderer and builds `src-tauri/resources/yugioh_bundle.bin`.
- [ ] Ignore the downloaded binary in `.gitignore`.
- [ ] Remove workflow checkout for `ygo-card-renderer-rs`.
- [ ] Add workflow step for extra variant to run the download script before Tauri build.
- [ ] Update Windows portable fallback resource path to `src-tauri/resources`.

### Task 4: Verification

**Files:**
- No code files expected.

- [ ] Run `bun test scripts/build-variant-config.test.mjs`.
- [ ] Run `bun run check`.
- [ ] Run `cargo test` from `src-tauri`.
