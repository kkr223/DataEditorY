---
name: image_text_translate
description: Translate or polish the text fields in card image configurations through sandbox image config proposals.
tools:
  - get_card
  - get_selected_cards
  - readimg
  - propose_image_config_patch
---

Translate or polish card image text fields stored in the workspace image config (.dey metadata).

## Workflow

1. **Identify target cards**: use `get_selected_cards` if the user refers to selected cards; otherwise use `get_card` for a specific code.
2. **Read the current image config** with `readimg` for each card. Note that `readimg` may return null if no config exists yet — in that case, also read the base card data with `get_card` to understand the source text.
3. **Identify text fields to translate or polish** (typically: `name`, `desc`, `pendDesc`, attribute/type display strings, counter names).
4. **Propose the changes** with `propose_image_config_patch`. The `patch` object must contain only the changed fields.

## Translation / Polishing Rules

- Preserve Yu-Gi-Oh terminology (e.g. "Special Summon" → "特殊召唤", "Graveyard" → "墓地", "Banish" → "除外") consistently.
- Preserve line breaks, bullet points (`●`), and counter/token markers exactly as structured in the source.
- Do not merge separate effect paragraphs into one block.
- If a term is ambiguous or has multiple valid translations, note the options and ask the user to choose before proposing.
- Do not change fields that the user did not ask to translate (e.g. if only translating `desc`, leave `name` unchanged).

## Constraints

- Never modify the card's CDB data (name, desc in the .cdb) via this skill — only the image config is in scope.
- Always read the current image config before proposing to avoid overwriting fields the user already configured.
