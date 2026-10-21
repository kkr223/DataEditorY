# src/lib/features/card-image/

## Responsibility

Card Image Maker Feature (extra only) — maps current card/draft data to `yugioh-card-ts`, renders previews with Leafer, and exports images. Runtime card-image configuration is editor metadata, not CDB data.

## Design

### Controllers

- **`controller.svelte.ts`** — card image workflow: reactive state for canvas/export settings, normalize config, sync card/draft data, trigger renders
- **`layout.ts`** — card image layout calculations: field positioning, text sizing, `CardImageConfigDocument` type and normalization
- **`adapter.ts`** — adapts card data from the editor into the `yugioh-card-ts` renderer format
- **`exporter.ts`** — export helpers for single-card and batch image output
- **`scriptRenderer.ts`** — renders Lua script code as a styled image (for code screenshot export)
- **`workspaceAssets.ts`** — resolves `workspace-asset:` references from metadata to image files under `.dey/card-image/`
- **`imageOperations.ts`** — cancels stale uploads, imports, and render work by CDB/card context and request generation; disposal invalidates pending work

Image surfaces create a controller per CDB/card identity after Explorer restoration. Foreground bitmap and transform changes are applied together. Workspace image filenames include a SHA-256 content fingerprint (legacy fixed filenames remain readable), and save acknowledgements replace inline data only when the image bytes match the current edit.

### Components

- `CardImageCanvas.svelte` — leafer-based canvas rendering the card image
- `CardImageControls.svelte` — export format, scale, and action controls
- `CardImageFieldEditor.svelte` — inline field editing overlay on the card image

## Integration

- **Consumed by**: `modules/card/workbench/ImageSurface.svelte`, `modules/card-image/workbench/CardImageWorkbench.svelte`
- **Depends on**: `yugioh-card-ts`, `leafer`/`leafer-unified`, domain (`card/`), stores (`editor`), typed native asset APIs
