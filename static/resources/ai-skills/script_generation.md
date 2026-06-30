---
name: script_generation
description: Generate or repair a complete official YGOPro Lua script for a card in the opened CDB.
tools:
  - list_open_databases
  - get_database_summary
  - search_cards
  - get_card
  - read_card_script
  - propose_script_write
---

Generate complete, runnable **official YGOPro** Lua scripts. Do not use Project Ignis / EDOPro-only APIs or naming.

## Workflow

1. **Read the target card** using `get_card` to obtain code, name, type, category, setcode, and full effect text (`desc`).
2. **Parse the effect text** into discrete numbered effects (`①②③…`). For each, identify:
   - Activation timing (when can it activate: hand / field / GY / either turn / opponent's turn)
   - Condition (passive check, `SetCondition`)
   - Cost (e.g. discard, send to GY, pay LP — goes in `cost` function, gated by `chk==0`)
   - Target selection (does the text say "as target" / "为对象"? → `SetTarget` + `Duel.SelectTarget`; "choose/select" during resolution? → `Duel.SelectMatchingCard` in `operation`)
   - Operation (the actual game action: destroy, bounce, search, SS, etc.)
   - Limit (once per turn, once per duel, hand limit, activation restriction)
   - Category (CATEGORY_DESTROY, CATEGORY_SPECIAL_SUMMON, CATEGORY_TODECK, etc. — see table below)
3. **Check for an existing script** with `read_card_script`. If found, use it as the base; never discard the existing structure without reason.
4. **Find 1–3 official reference scripts**: use `search_cards` with keywords from `desc` to locate cards with functionally similar effects in the same CDB, then call `read_card_script` for each. Prefer cards with modern numbered effects (`①：`). Use those scripts as style and API references, not copy-paste templates.
5. **Write the script** in one `propose_script_write` call. The file name must be `c{code}.lua`.
6. After the script is written, invoke the `@script_test` skill to write a minimal test plan.

## Script Requirements

### Boilerplate

```lua
-- c{code}.lua  {card name}
local s, id, o = GetID()
```

Every script starts exactly with this line (substitute actual values). `s` is the script table, `id` is the card code, `o` is the owner.

### Effect Registration Pattern

```lua
function s.initial_effect(c)
  -- effect e1
  local e1 = Effect.CreateEffect(c)
  e1:SetDescription(aux.Stringid(id, 0))
  e1:SetCategory(CATEGORY_DESTROY)
  e1:SetType(EFFECT_TYPE_IGNITION)     -- or TRIGGER, QUICK, etc.
  e1:SetRange(LOCATION_MZONE)
  e1:SetCountLimit(1, id)              -- once per turn, unique id = card code
  e1:SetCondition(s.e1con)
  e1:SetCost(s.e1cost)
  e1:SetTarget(s.e1tg)
  e1:SetOperation(s.e1op)
  c:RegisterEffect(e1)
end
```

Use `e1`, `e2`, … for effect locals. Register all effects inside `s.initial_effect`.

### Effect Types

| Text cue | SetType |
|---|---|
| Ignition (player chooses to activate during Main Phase) | `EFFECT_TYPE_IGNITION` |
| Trigger (activates automatically when condition met) | `EFFECT_TYPE_TRIGGER_O` (mandatory) or `EFFECT_TYPE_TRIGGER_F` (optional) |
| Quick / Trap / spell speed 2+ | `EFFECT_TYPE_QUICK_O` or `EFFECT_TYPE_QUICK_F` |
| Continuous effect (always active) | `EFFECT_TYPE_SINGLE` (on-card) or `EFFECT_TYPE_FIELD` (field-wide) |

Use `_O` (obligatory) vs `_F` (facultative) correctly: if the player may choose not to activate, use `_F`.

### Cost / chk==0 Rule

Functions used in `SetCost` and `SetTarget` receive a `chk` parameter:
- `chk == 0`: feasibility check only — **no game state mutations allowed here**.
- `chk ~= 0`: perform the action.

```lua
function s.e1cost(e, tp, eg, ep, ev, re, r, rp, chk)
  if chk == 0 then return Duel.IsExistingMatchingCard(s.filter, tp, LOCATION_HAND, 0, 1, nil) end
  Duel.DiscardHand(tp, s.filter, 1, 1, REASON_COST)
end
```

### Targeting

Use `Duel.SelectTarget` when the effect text says "as target" / "为对象":
```lua
function s.e1tg(e, tp, eg, ep, ev, re, r, rp, chk, chkc)
  if chkc then return chkc:IsLocation(LOCATION_MZONE) and chkc:IsControler(tp) end
  if chk == 0 then return Duel.IsExistingTarget(s.filter, tp, LOCATION_MZONE, 0, 1, nil) end
  Duel.SelectTarget(tp, s.filter, tp, LOCATION_MZONE, 0, 1, 1, nil)
  Duel.SetOperationInfo(0, CATEGORY_DESTROY, nil, 1, 0, 0)
end
```

Use `Duel.SelectMatchingCard` inside `operation` (no separate target function) when the text says "choose/select" during resolution without pre-selection.

### SetOperationInfo

Call `Duel.SetOperationInfo` inside `target` (or `operation` if no target) for any chain-relevant action:

| Action | Category constant |
|---|---|
| Destroy | `CATEGORY_DESTROY` |
| Special Summon | `CATEGORY_SPECIAL_SUMMON` |
| Send to GY | `CATEGORY_TOGRAVE` |
| Return to hand | `CATEGORY_TOHAND` |
| Return to deck | `CATEGORY_TODECK` |
| Banish | `CATEGORY_REMOVE` |
| Search (add to hand from deck) | `CATEGORY_TOHAND` + source LOCATION_DECK |
| Draw | `CATEGORY_DRAW` |
| Damage | `CATEGORY_DAMAGE` |
| Recover LP | `CATEGORY_RECOVER` |
| Change ATK/DEF | `CATEGORY_ATKCHANGE` |

### Descriptions and Strings

Every activatable effect needs a description:
```lua
e1:SetDescription(aux.Stringid(id, 0))  -- uses texts.str1 in the CDB (index 0)
e2:SetDescription(aux.Stringid(id, 1))  -- uses texts.str2 (index 1)
```

**Always note in the final response** which `texts.str{n}` entries need to be set in the CDB for each `Stringid(id, n)` call used.

If the description is a standard automatic text (e.g. "Special Summon this card"), check whether `aux.Stringid` is even needed — some effects use no description.

### Filters

Define filter functions as `s.filter`:
```lua
function s.filter(c)
  return c:IsType(TYPE_MONSTER) and c:IsAbleToGrave()
end
```

Avoid capturing variables inside filter closures when possible; pass additional constraints via the `extraargs` parameter of selection functions.

### Count Limits

```lua
e1:SetCountLimit(1, id)            -- once per turn by card code
e1:SetCountLimit(1, id + 1)        -- separate once-per-turn counter (use id+n for distinct limits)
e1:SetCountLimit(1, id, EFFECT_COUNT_CODE_DUEL)  -- once per duel
```

### Common Effect Templates

**Ignition: destroy one card the opponent controls**
```lua
e1:SetCategory(CATEGORY_DESTROY)
e1:SetType(EFFECT_TYPE_IGNITION)
e1:SetRange(LOCATION_MZONE)
e1:SetCountLimit(1, id)
e1:SetTarget(s.e1tg)
e1:SetOperation(s.e1op)

function s.e1tg(e, tp, eg, ep, ev, re, r, rp, chk, chkc)
  if chkc then return chkc:IsControler(1 - tp) and chkc:IsAbleToDestroy() end
  if chk == 0 then return Duel.IsExistingTarget(Card.IsAbleToDestroy, tp, 0, LOCATION_MZONE, 1, nil) end
  Duel.SelectTarget(tp, Card.IsAbleToDestroy, tp, 0, LOCATION_MZONE, 1, 1, nil)
  Duel.SetOperationInfo(0, CATEGORY_DESTROY, nil, 1, 0, 0)
end
function s.e1op(e, tp, eg, ep, ev, re, r, rp)
  local tc = Duel.GetFirstTarget()
  if tc and tc:IsRelateToEffect(e) then Duel.Destroy(tc, REASON_EFFECT) end
end
```

**Trigger: when this card is sent to GY, add one card from deck to hand**
```lua
e1:SetCategory(CATEGORY_TOHAND)
e1:SetType(EFFECT_TYPE_TRIGGER_O)
e1:SetCode(EVENT_TO_GRAVE)
e1:SetRange(LOCATION_GRAVE)
e1:SetCountLimit(1, id)
e1:SetTarget(s.e1tg)
e1:SetOperation(s.e1op)

function s.e1tg(e, tp, eg, ep, ev, re, r, rp, chk)
  if chk == 0 then return Duel.IsExistingMatchingCard(s.filter, tp, LOCATION_DECK, 0, 1, nil) end
  Duel.SetOperationInfo(0, CATEGORY_TOHAND, nil, 1, LOCATION_DECK, tp)
end
function s.e1op(e, tp, eg, ep, ev, re, r, rp)
  Duel.SelectMatchingCard(tp, s.filter, tp, LOCATION_DECK, 0, 1, 1, nil)
  local tc = Duel.GetFirstSelected()
  if tc then Duel.SendtoHand(tc, nil, REASON_EFFECT) end
  Duel.HintSelection(Duel.GetSelectGroup())
end
```

**Continuous: ATK modifier while on field**
```lua
local e1 = Effect.CreateEffect(c)
e1:SetType(EFFECT_TYPE_SINGLE)
e1:SetCode(EFFECT_UPDATE_ATTACK)
e1:SetValue(500)
c:RegisterEffect(e1)
```

### Special Summon Effects

When an effect Special Summons from GY:
```lua
e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
-- in target/operation:
if chk == 0 then return e:GetHandler():IsAbleToSpecialSummon() end
Duel.SpecialSummon(e:GetHandler(), 0, tp, tp, false, false, POS_FACEUP)
```

Use `Duel.GetMatchingGroup` + `Duel.SelectTarget` when selecting which monster to SS.

## Constraints

- Only propose a full `.lua` file — never a partial snippet.
- Always use `propose_script_write`. Never describe a script and ask the user to write it.
- Do not use EDOPro-only helpers, constants, or aliases.
- Do not invent effect logic not present in `desc`. If an API cannot be verified, produce the smallest safe draft and note the uncertainty.
- If a referenced similar card's script is not found, continue only when the remaining behavior is still unambiguous from the card text.
- After proposing, list all `aux.Stringid(id, n)` calls used and the corresponding `texts.str{n+1}` CDB string that the user must set.
