---
name: script_test
description: Write a minimal in-app test plan for a YGOPro Lua card script and queue it as a sandbox proposal.
tools:
  - list_open_databases
  - get_card
  - read_card_script
  - get_script_test_context
  - propose_script_test_plan
---

Write small, deterministic JSON test plans for official YGOPro Lua card scripts. The plan is executed by the built-in runner (ocgcore + CDB), not by TypeScript code.

## Workflow

1. **Read the target card** with `get_card` to confirm code, type, and effect text.
2. **Read the existing or proposed script** with `read_card_script` to understand which functions and effects should be exercised.
3. **Get test context** with `get_script_test_context` to obtain: `cdbPath`, `scriptDir`, `testPlanPath`, and `builtinHelpers` (`constant.lua`, `utility.lua`, `procedure.lua`).
4. **Decide the appropriate test complexity** based on what the card does (see Strategy below).
5. **Write the test plan** in one `propose_script_test_plan` call.

## Test Strategy by Card Type

| Card type | Minimum plan | Enhanced plan |
|---|---|---|
| Any card | `load-script` + `assert-no-redtext` | — |
| Monster that goes to field | + `start-duel`, place in mzone, `assert-field-count` | Check ATK/DEF if modified by continuous effect |
| Spell/Trap | `load-script` + `assert-no-redtext` | + `start-duel`, `advance` to trigger resolution |
| GY-trigger effect | `start-duel`, send card to GY setup, `advance`, `assert-field-count` in grave | |
| Draw/search effect | `start-duel`, `advance`, assert hand count increases | |
| Damage effect | `start-duel`, `advance`, `assert-lp` | |

When the effect is too complex for deterministic assertion with available check kinds, use the minimal plan (`load-script` + `assert-no-redtext`) and note the limitation in the response.

## Test Plan Schema

```json
{
  "version": 1,
  "cardCode": 12345678,
  "seed": 42,
  "includeScripts": [],
  "setup": [
    {
      "code": 12345678,
      "controller": 0,
      "owner": 0,
      "location": "hand",
      "sequence": 0,
      "position": "faceup_attack"
    }
  ],
  "checks": [
    { "kind": "load-script" },
    { "kind": "start-duel" },
    { "kind": "advance", "maxSteps": 80 },
    { "kind": "assert-no-redtext" }
  ]
}
```

### Top-Level Fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `version` | number | — | Always `1`. |
| `cardCode` | number | — | Primary card being tested. Required. |
| `seed` | number \| number[] | — | Random seed(s) for deterministic duel. Use a fixed integer (e.g. `42`) whenever you want reproducible results. Pass an array of up to 8 numbers for multi-seed runs. |
| `start` | number \| object | — | Start options passed to `startDuel`. Omit for defaults. |
| `includeScripts` | string[] | `[]` | Additional `c{code}.lua` files to preload beyond the target card and setup cards. Use when the effect interacts with other specific cards whose scripts exist. |
| `setup` | object[] | `[]` | Cards to place on the field before checks run (see Setup Cards below). |
| `checks` | object[] | — | Ordered list of check steps (see Check Kinds below). |

### Setup Cards

Each setup object places one card on the field before any check runs. All setup card scripts are auto-included; you do not need to list them in `includeScripts`.

```json
{
  "code": 12345678,
  "controller": 0,
  "owner": 0,
  "location": "mzone",
  "sequence": 0,
  "position": "faceup_attack"
}
```

| Field | Values | Default | Notes |
|---|---|---|---|
| `code` | positive integer | — | Required. |
| `controller` | `0` or `1` | `0` | 0 = player, 1 = opponent. |
| `owner` | `0` or `1` | same as controller | |
| `location` | see table | — | Required. |
| `sequence` | 0–4 (mzone/szone) | `0` | Zone index within the location. |
| `position` | see table | `"faceup_attack"` | |

**Supported locations**: `deck`, `hand`, `mzone`, `szone`, `grave`, `removed`, `banished`, `extra`.

**Supported positions**: `faceup_attack`, `facedown_attack`, `faceup_defense`, `facedown_defense`.

**Tips**:
- To test a GY trigger, set `location` to `grave`.
- To test a field spell, set `location` to `szone` with `sequence: 5` (field zone index).
- To set up an opponent's monster as a destroy target, use `controller: 1` with `location: "mzone"`.

### Check Kinds

| `kind` | Parameters | Notes |
|---|---|---|
| `load-script` | `code?` (default: cardCode) | Preloads the Lua script into the duel engine. Always include as first check. |
| `start-duel` | — | Starts the duel with the current setup and seed. Required before `advance` or field assertions. |
| `advance` | `maxSteps` (1–500, default 80) | Advances the duel silently up to N steps. Increase for complex chains or multi-phase setups. |
| `assert-no-redtext` | — | Fails if any Lua script error was logged. Always include. |
| `assert-lp` | `player` (0/1), `equals` (number) | Assert a player's LP is an exact value. Use after a damage or recovery effect. |
| `assert-field-count` | `player` (0/1), `location` (string), `equals`/`min`/`max` | Assert card count in a zone. Use `min`/`max` for ranges when exact count may vary. |

### assert-field-count Examples

```json
{ "kind": "assert-field-count", "player": 0, "location": "mzone", "equals": 1 }
{ "kind": "assert-field-count", "player": 0, "location": "hand", "min": 1 }
{ "kind": "assert-field-count", "player": 0, "location": "grave", "max": 0 }
```

### assert-lp Examples

```json
{ "kind": "assert-lp", "player": 1, "equals": 6500 }
```

## Runner Behavior

- The runner uses the current CDB working copy and preloads the built-in helpers (`constant.lua`, `utility.lua`, `procedure.lua`) automatically. Do not list these in `includeScripts`.
- Setup card scripts are auto-included; only list in `includeScripts` if additional cards are needed for interaction tests.
- `advance` runs silently: AI decisions are made automatically; the runner does not simulate manual player input. Effects that require the player to choose may not activate unless a valid target exists.
- The `seed` field controls shuffle order and AI decision randomness. Use a fixed seed to make the test deterministic across reruns. If the effect involves deck searching, set a seed so the shuffle is reproducible.

## Minimal Plan (fallback)

When the effect is too interactive, stateful, or branching to assert with the available check kinds:

```json
{
  "version": 1,
  "cardCode": 12345678,
  "checks": [
    { "kind": "load-script" },
    { "kind": "assert-no-redtext" }
  ]
}
```

This verifies the script loads without syntax errors. Note the limitation in the response.

## Constraints

- Only propose a complete JSON test plan — never TypeScript code.
- Always use `propose_script_test_plan`. Never describe a test plan and ask the user to write it.
- Tests are written under `.dey/ai-tests`. The runner only reads from there.
- Cover at least `load-script` + `assert-no-redtext` in every plan.
- Do not reuse the same `sequence` index for two setup cards in the same location.
