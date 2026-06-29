---
name: script_generation
description: Generate or repair a complete official YGOPro Lua script for a card in the opened CDB.
tools:
  - list_open_databases
  - get_database_summary
  - search_cards
  - get_card
  - read_card_script
  - get_script_test_context
  - propose_script_write
  - propose_script_test_plan
---

Generate complete, runnable **official YGOPro** Lua scripts. Do not use Project Ignis / EDOPro-only APIs or naming.

## Workflow

1. **Read the target card** using `get_card` to obtain code, name, type, category, setcode, and full effect text (`desc`).
2. **Split the effect text** into activation timing, condition, cost, target selection, operation, limits, and categories before writing code.
3. **Check for an existing script** with `read_card_script`. If one exists, treat it as the base to modify; never discard existing structure without reason.
4. **Find official references**: use `search_cards` to find 1-3 cards with similar official effect text, then read their scripts with `read_card_script`. Prefer cards whose text uses numbered modern effects such as `①：`.
5. **Write the script** in one `propose_script_write` call. The file name must be `c{code}.lua`.
6. **Write a minimal test plan** in one `propose_script_test_plan` call. The plan is temporary JSON and will be saved under `.dey/ai-tests/c{code}.test-plan.json`.

## Test Plan Schema

Use this small JSON shape. Keep it deterministic and only add checks the runner supports.

```json
{
  "version": 1,
  "cardCode": 12345678,
  "includeScripts": ["c12345678.lua"],
  "setup": [
    { "code": 12345678, "controller": 0, "location": "hand", "position": "faceup_attack" }
  ],
  "checks": [
    { "kind": "load-script" },
    { "kind": "advance", "maxSteps": 80 },
    { "kind": "assert-no-redtext" }
  ]
}
```

Supported check kinds: `load-script`, `start-duel`, `advance`, `assert-no-redtext`, `assert-lp`, `assert-field-count`.
Supported locations: `deck`, `hand`, `mzone`, `szone`, `grave`, `removed`, `banished`, `extra`.

## Script Requirements

- Start with `local s,id,o=GetID()`.
- Use official YGOPro style: `Effect.CreateEffect(c)`, `SetCategory(CATEGORY_*)`, `SetType(EFFECT_TYPE_*)`, `SetCode(EVENT_*)`, `SetProperty(...)`, `SetCountLimit(...)`, and `c:RegisterEffect(e)`.
- If an effect activates or can be chosen by the player, set a description with `e:SetDescription(aux.Stringid(id,n))`; mention any required `texts.str{n+1}` CDB string updates in the final response.
- If text says "as target" / "为对象", use target flags and `Duel.SelectTarget`; if text only says "choose/select" during resolution, choose in `operation` with `Duel.SelectMatchingCard` and `Duel.HintSelection`.
- Keep `cost`, `target`, and `operation` separate. `chk==0` branches only check whether the action is possible; do not mutate game state there.
- Use `Duel.SetOperationInfo` for search, send-to-GY, add-to-hand, special summon, destroy, banish, draw, damage, recover, and similar chain-relevant actions.
- Generate a small JSON test plan for the built-in runner. The runner uses the current CDB, preloads built-in `constant.lua`, `utility.lua`, and `procedure.lua`, and also loads non-card helper scripts from the configured script directory when present. Put any other card scripts needed by the setup into `setup` or `includeScripts`. Cover at least script loading plus one pure condition/target-check assertion when practical.
- Do not invent effect logic not present in `desc`. If the available tools cannot verify an API or official reference, say what is uncertain and produce the smallest safe draft.

## Constraints

- Only propose a full `.lua` file — never a partial snippet.
- Only propose a complete JSON test plan for tests — never TypeScript code.
- Do not ask to write the real file; always use `propose_script_write`.
- Do not write tests outside `.dey`; use `propose_script_test_plan`.
- Do not use EDOPro-only helpers, constants, or aliases.
- If a referenced similar card's script is not found, note it and continue only when the remaining behavior is still clear.
