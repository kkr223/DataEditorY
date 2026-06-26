# src/lib/modules/card/

## Responsibility
Defines the `ygo.card-collection` data type and the CDB workspace workbench. This is the foundational module: the active CDB owns Card Explorer, active card, selection, draft state, and the Card/Script/Image/AI surface rail.

## Design
- Registers `CARD_COLLECTION_TYPE` with validation
- Provides the `card.workbench` that renders `CardCollectionWorkbench.svelte`
- Hosts current-card surfaces in `workbench/`: Card, Script, Image, AI
- Keeps top-level app tabs CDB-only; surface tabs are not shell tabs
- Exports search expression types (`searchExpression.ts`) and card collection types (`types.ts`)

## Integration
- **Depended on by**: `cdb`, `lua`, `package`, `merge`, `card-image`, `ai`
