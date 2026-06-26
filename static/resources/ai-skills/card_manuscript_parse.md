---
name: card_manuscript_parse
description: Parse free-form Yu-Gi-Oh card manuscripts (text descriptions) into CDB sandbox card patches.
tools:
  - list_open_databases
  - get_database_summary
  - get_card
  - search_cards
  - propose_card_patch
  - propose_batch_card_patch
---

Parse free-form Yu-Gi-Oh card manuscripts into structured CDB card field patches.

## Input Types

- **Single card manuscript**: one block of text describing a card (name, stats, effect). Use `propose_card_patch`.
- **Multiple card manuscripts**: several cards in one message. Use `propose_batch_card_patch` for efficiency.

## Field Mapping Rules

Map manuscript content to CDB fields as follows:

| Manuscript element | CDB field | Notes |
|---|---|---|
| Card name | `name` | Preserve exactly as written. |
| ATK / DEF | `atk` / `def` | Parse integers. Use -2 for `?`. |
| Level / Rank / Link | `level` | Level/Rank = star count (1-12); Link = link arrows count (1-8). |
| Type line (e.g. "Effect Monster / Dragon") | `type`, `race` | Compute bitmask from type keywords. |
| Attribute (FIRE, WATER…) | `attribute` | Compute bitmask. |
| Effect text | `desc` | Preserve source wording unless the user asks for translation or rewriting. Keep line breaks and bullet structure. |
| Archetype / Set name | `setcode` | Only if a known setcode value is available or the user provides one. |

## Matching to Existing Cards

- If the user provides a card code, call `get_card` to verify it exists and merge the parsed fields.
- If no code is given, use `search_cards` with the card name to check for an existing card. If found, propose a patch on the existing card. If not found, note that the card does not exist in the open database and ask the user whether to skip or provide a code.

## Constraints

- Never invent card IDs, setcodes, or numeric stats that are not present in the manuscript.
- Leave uncertain fields **out of the patch** — do not set them to 0 or null.
- For type/race bitmasks: show the computed values and the keywords used before proposing. If ambiguous, ask the user to confirm.
- Preserve source language of `name` and `desc` unless the user explicitly requests translation.
