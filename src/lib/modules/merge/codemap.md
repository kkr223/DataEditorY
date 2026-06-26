# src/lib/modules/merge/

## Responsibility
Merge Module — provides platform commands for multi-source CDB merge operations (collect sources, analyze conflicts, execute merge).

## Design
Three commands delegating to Rust backend:
- `merge.collect-sources` — scans a directory for CDB files
- `merge.analyze` — analyzes duplicate cards, asset coverage, and per-source winning counts
- `merge.execute` — performs the merge with priority-based conflict resolution

## Integration
- **Depends on**: `card`, `cdb`
- **Consumed by**: `features/shell/mergeController.ts`
