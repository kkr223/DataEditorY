# src/lib/modules/package/

## Responsibility

Dependency-only extension module. Packaging operations are routed through
`native/taskApi` (`package.zip` kind), so the module registers no workbench or
codec of its own.

## Files

- `index.ts` — `packageModule` declaration consumed by `base.ts`.

## Integration

- **Consumed by**: `src/lib/modules/base.ts`
- **Depends on**: `src/lib/platform/` types only
