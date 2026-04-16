# Build Stubs

This directory contains stub modules used by the build variant system.

## How It Works

DataEditorY ships two build variants controlled by the `APP_VARIANT` environment variable:

- **`extra`** (default): Full-featured build with card-image, card-maker, and AI features.
- **`base`**: Database editor only — card-image/AI features are excluded.

### Mechanism

1. `scripts/build-variant-config.mjs` defines which features each variant includes.
2. `vite.config.js` reads the active variant and sets Vite **path aliases** for excluded features. For example, when building `base`, imports like `$lib/features/card-image/...` are redirected to `$lib/build-stubs/base/features/card-image/...`.
3. The stub modules in `base/` export no-op implementations or empty components so the rest of the code compiles without conditional imports.
4. `src/lib/config/build.ts` exposes runtime flags (e.g. `HAS_CARD_IMAGE_FEATURE`) derived from the variant, allowing UI code to hide controls that have no backing implementation.

### Dev / Build Commands

```bash
bun run dev:base        # Run base variant in dev mode
bun run dev:extra       # Run extra variant in dev mode
bun run tauri:dev:base  # Run Tauri desktop app (base)
bun run tauri:dev:extra # Run Tauri desktop app (extra)
bun run build:base      # Production build (base)
bun run build:extra     # Production build (extra)
bun run tauri:build:all # Build both variants for release
```

### Adding a New Stub

When a new feature module is added and should be excluded from `base`:

1. Create a stub under `base/features/<feature-name>/` that mirrors the real module's exports with no-op values.
2. Register the alias in `scripts/build-variant-config.mjs`.
3. Add a corresponding runtime flag in `src/lib/config/build.ts` if UI needs to check feature availability.
