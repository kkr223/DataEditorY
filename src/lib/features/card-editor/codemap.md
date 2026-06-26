# src/lib/features/card-editor/

## Responsibility

Card Editor Feature — manages the single-card editing form, DEX-style draft search, draft lifecycle, validation, and surface entry actions.

## Design

### Controllers

- **`controller.ts`** — card editor orchestration: load card into draft, compare dirty state, draft undo, build draft-driven search filters
- **`searchController.ts`** — DEX-style quick search: transfer current draft fields into Card Explorer filters, reset/search workflow
- **`lifecycle.ts`** — initialization hooks for the card editor workspace
- **`useCases.ts`** — base use cases: commit draft, save/delete/create/copy/paste, switch-card handling
- **`extraUseCases.ts`** — extra-only image helper flows

### Components

- `CardEditorForm.svelte` — main card editing form (all 17+ fields)
- `CardEditorHeader.svelte` — card name, code, alias display
- `CardEditorFooter.svelte` — action buttons in draft-search-first order: search from draft, reset search, clear new, save as, modify, delete
- `CardCategoryPopover.svelte` — category/OT field editor
- `CardImagePreview.svelte` — card image thumbnail preview
- `CardImageDrawerHost.svelte` — legacy drawer host; current workspace image flow routes through the Image surface

## Integration

- **Consumed by**: `modules/card/workbench/CardCollectionWorkbench.svelte`
- **Depends on**: stores (`editor`, `db`, `cardClipboard`), domain (`card/draft`, `card/taxonomy`, `card/validation`), services
