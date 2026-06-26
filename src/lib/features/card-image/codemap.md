# src/lib/features/card-image/

## Responsibility

Card Image Maker Feature (extra only) — maps current card/draft data to `yugioh-card-ts`, renders previews with Leafer, and exports images. Runtime card-image configuration is editor metadata, not CDB data.

## Design

### Controllers

- **`controller.ts`** — card image workflow: normalize config, sync card/draft data, trigger renders
- **`controller.svelte.ts`** — reactive state management for canvas and export settings
- **`layout.ts`** — card image layout calculations: field positioning, text sizing, `CardImageConfigDocument` type and normalization
- **`adapter.ts`** — adapts card data from the editor into the `yugioh-card-ts` renderer format
- **`exporter.ts`** — export helpers for single-card and batch image output
- **`scriptRenderer.ts`** — renders Lua script code as a styled image (for code screenshot export)

### Components

- `CardImageCanvas.svelte` — leafer-based canvas rendering the card image
- `CardImageControls.svelte` — export format, scale, and action controls
- `CardImageFieldEditor.svelte` — inline field editing overlay on the card image

## Integration

- **Consumed by**: `modules/card/workbench/ImageSurface.svelte`, `modules/card-image/workbench/CardImageWorkbench.svelte`
- **Depends on**: `yugioh-card-ts`, `leafer`/`leafer-unified`, domain (`card/`), stores (`editor`), infrastructure
