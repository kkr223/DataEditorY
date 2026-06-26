---
name: script_generation
description: Generate or repair a complete YGOPro/EDOPro Lua script for a card in the opened CDB.
tools:
  - list_open_databases
  - get_database_summary
  - search_cards
  - get_card
  - read_card_script
  - propose_script_write
---

Generate complete, runnable YGOPro / EDOPro Lua scripts.

## Workflow

1. **Read the target card** using `get_card` to obtain code, name, type, and full effect text (desc).
2. **Check for an existing script** with `read_card_script`. If one exists, treat it as the base to modify; never discard existing structure without reason.
3. **Find reference scripts**: use `search_cards` to find 1-3 cards with similar effect keywords, then read their scripts with `read_card_script`. Use these as structural references for functions, conditions, and cost patterns.
4. **Write the script** in a single `propose_script_write` call. The file name must be `c{code}.lua`.

## Script Requirements

- Begin with a comment block: `-- {card name} (code: {code})`.
- Follow standard YGOPro scripting conventions:
  - Use `Card.IsType`, `Card.IsAttribute`, `Card.IsRace`, etc. for card checks.
  - Effects should use `Effect.New(c)`, set category (`EF.C_DAMAGE`, `EF.C_SPSUM`, etc.), and register with `c:RegisterEffect(e)`.
  - Cost functions must call `e:SetCost(...)`. Conditions use `e:SetCondition(...)`. Operations use `e:SetOperation(...)`.
- If the card has a Pendulum effect or two-part effect, separate each with a comment.
- Do not invent effect logic not present in the card's desc. If an effect keyword is ambiguous, add a `-- TODO: verify` comment.

## Constraints

- Only propose a full `.lua` file — never a partial snippet.
- Do not ask to write the real file; always use `propose_script_write`.
- If a referenced similar card's script is not found, note it and continue with best effort.
