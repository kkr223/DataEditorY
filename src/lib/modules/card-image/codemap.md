# src/lib/modules/card-image/

## Responsibility
Card Image Module (extra only) — provides card image configuration types, renderer wiring, image workbench compatibility, and Card/Image surface contributions.

## Design
- `CARD_IMAGE_CONFIG_TYPE` data type with form data normalization
- `CARD_IMAGE_PROVIDER_ID` — `MemoryDocumentProvider`
- JSON codec for `*-card-image.json` files
- `card-image.workbench` renders `CardImageWorkbench.svelte` for legacy/document-runtime hosting
- `card-image.card-actions` routes current-card image editing to `ImageSurface.svelte`
- Per-card image overrides are saved in `.dey` metadata, not in `.cdb`

## Integration
- **Depends on**: `card` module
- **Contributes to**: `card.workbench` (footer-actions slot)
