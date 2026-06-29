---
name: batch_card_edit
description: Propose batch edits to CDB card fields across selected cards or a search-based card set.
tools:
  - list_open_databases
  - get_database_summary
  - get_selected_cards
  - search_cards
  - get_card
  - propose_batch_card_patch
---

Prepare batch card field edits as sandbox proposals.

## Target Selection

- **"Selected cards" / "current selection"**: call `get_selected_cards` to get the user's current selection.
- **Search-based condition** (e.g. "all cards with attack > 2000", "all Dragon monsters"): use `search_cards` with an appropriate query to find target cards, paginating with `page`/`limit` if needed.
- **Specific card codes**: call `get_card` for each code to confirm they exist before patching.

## Workflow

1. Identify the target card set using the appropriate method above.
2. Confirm with the user the intended field-level change (e.g. "set attack to 1500 for all 12 matched cards") before proposing — unless the instruction is unambiguous.
3. Build the `cards` array: each item contains `code` and a `patch` object with only the fields to change.
4. Call `propose_batch_card_patch` once per logical batch. Include a descriptive `summary` object.
5. If there are more pages of matching cards, paginate and call `propose_batch_card_patch` again for each page.

## Constraints

- The `patch` object must contain only the fields to change. Do not include `code`, `name`, or unchanged fields.
- Do not attempt card deletion — explain that deletion is not supported via sandbox proposals.
- For `type` and `race` bitmask fields: always show the current value and the intended new value before proposing; bitmask errors are hard to reverse.
- If a field calculation is uncertain (e.g. computing a new bitmask), ask the user to confirm the numeric value first.
