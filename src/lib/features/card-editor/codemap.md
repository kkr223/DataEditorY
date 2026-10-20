# src/lib/features/card-editor/

## Responsibility

Card Editor Feature — manages the single-card editing form, DEX-style draft search, draft lifecycle, validation, and surface entry actions.

## Design

### Controllers

- **`controller.ts`** — card editor orchestration: load card into draft, compare dirty state, draft undo, build draft-driven search filters
- **`searchController.ts`** — DEX-style quick search: transfer current draft fields into Card Explorer filters, reset/search workflow
- **`lifecycle.ts`** — initialization hooks for the card editor workspace
- **`useCases.ts`** — base use cases: commit draft, save/delete/create/copy/paste, switch-card handling
  ID changes review the destination card and pass its snapshot to the host. Commits acknowledge only the submitted draft; newer input survives async writes/refreshes and blocks navigation or CDB save until committed.
- **`selectionActions.ts`** — shared copy/paste/delete flows for shortcuts and context menus; captures the target CDB and uses the document host mutation pipeline
- **`cardNavigation.ts`** — commits the current draft before selecting a card and opening its card/script/image surface; reveals off-page targets through an ID filter
- **`extraUseCases.ts`** — extra-only image helper flows

### Components

- `CardEditorForm.svelte` — main card editing form (all 17+ fields)
- `CardEditorHeader.svelte` — card name, code, alias display
- `CardEditorFooter.svelte` — action buttons in draft-search-first order: search from draft, reset search, clear new, save as, modify, delete
- `CardCategoryPopover.svelte` — category/OT field editor
- `CardImagePreview.svelte` — card image thumbnail preview

## Integration

- **Consumed by**: `modules/card/workbench/CardCollectionWorkbench.svelte`
- **Depends on**: stores (`editor`, `db`, `cardClipboard`), domain (`card/draft`, `card/taxonomy`, `card/validation`), services
