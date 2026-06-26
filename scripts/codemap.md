# scripts/

## Responsibility

Build System — Node.js scripts for managing the variant build pipeline (base/extra), Lua intellisense data generation, and build artifact cleanup.

## Scripts

| Script | Purpose |
|--------|---------|
| `build-variant-config.mjs` | Defines `BUILD_VARIANTS` (base/extra) with module lists, product names, identifiers, and bundle resource maps. Exports `getBuildVariantConfig()`, `createTauriVariantConfig()`, `getPackageVersion()` |
| `run-variant-build.mjs` | Main build orchestrator. Supports modes: `frontend` (build), `dev-frontend` (dev server), `check` (type check), `tauri` (desktop build), `build-all` (both variants). Rewrites `src/lib/modules/active.ts` to point to the correct variant entry file, then restores it |
| `write-tauri-config.mjs` | Writes a variant-specific `tauri.conf.json` (used by CI to prepare config before `tauri-action`) |
| `build-lua-intel.mjs` | Parses `_functions.txt`, `constant.lua`, `snippets.json`, and `def.lua` from `static/resources/` to generate `src/lib/data/lua-intel/catalog.generated.ts` — the Lua intellisense catalog |
| `remove-build-assets.mjs` | Cleans up build output assets (post-build cleanup) |

## Variant System Flow

```
1. run-variant-build.mjs receives mode + variant
2. Rewrites src/lib/modules/active.ts → import from './base' or './extra'
3. Sets APP_VARIANT env var
4. Runs build command (vite build, vite dev, or tauri build)
5. Restores active.ts to original content (finally block)
```

For Tauri builds, it also:
- Rewrites `tauri.conf.json` with variant-specific config (product name, identifier, bundle resources)
- Cleans up stale `resources/` and `wix/` directories
- Restores `tauri.conf.json` after build

## CI/CD

`.github/workflows/release.yml` — GitHub Actions matrix build:
- Platforms: `windows-latest`, `ubuntu-22.04`, `macos-latest`
- Variants: `base`, `extra`
- Uses `tauri-action` for building + release asset upload
- Windows: additionally creates portable ZIP bundle

## Integration

- **Consumed by**: `package.json` scripts, GitHub Actions
- **Depends on**: `build-variant-config.mjs` (shared config), `static/resources/` (source data)
