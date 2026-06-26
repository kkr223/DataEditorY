# src/lib/services/

## Responsibility

Application Services Layer — orchestrates cross-cutting concerns that span domain, stores, typed native APIs, and infrastructure. Services stay thin; current workspace state should live in CDB workbench/store layers.

## Services

| File | Purpose |
|------|---------|
| `cardScriptService.ts` | Card script operations: read/write/save scripts, manage script paths relative to CDB location |
| `cardImageService.ts` | Card image operations: import card images to `pics/` directory, read/convert images |
| `setcodeCatalog.ts` | Setcode (archetype) catalog: loads and indexes archetype names from `strings.conf` for autocomplete |

## Integration

- **Consumed by**: features (card-editor, script-editor, AI), CDB surfaces, stores
- **Depends on**: native APIs/infrastructure, domain, stores
