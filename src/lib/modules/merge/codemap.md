# src/lib/modules/merge/

## Responsibility

Merge Module — dependency-only placeholder that declares the `merge` module and its dependency on `card` + `cdb`. The actual merge operations (collect sources, analyze, execute) are routed through `native/taskApi` with kinds `merge.collect-sources`, `merge.analyze`, and `merge.execute`, which call the Rust backend directly.

## Integration
- **Depends on**: `card`, `cdb`
- **Consumed by**: `features/shell/mergeController.ts` (via `native/taskApi.startTask`)
