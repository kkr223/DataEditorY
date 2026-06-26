# src/lib/config/

## Responsibility

Build Configuration — exports compile-time constants injected by Vite.

## Design

- `build.ts` — exposes `APP_BUILD_VARIANT` (`"base"` | `"extra"`), `APP_BUILD_LABEL`, `APP_MODULE_IDS` array, and `hasBuiltInModule(id)` helper
- These are populated by Vite's `define` plugin from `scripts/build-variant-config.mjs`

## Integration

- **Consumed by**: feature controllers (to conditionally enable extra features), modules
- **Depends on**: Vite compile-time injection
