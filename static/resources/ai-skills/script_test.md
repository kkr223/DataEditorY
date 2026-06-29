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

Write small, deterministic JSON test plans for official YGOPro Lua card scripts. The plan is executed by the built-in runner (ocgcore + CDB), never by TypeScript code.

## Workflow

1. **Read the target card** with `get_card` to confirm code, type, and effect text.
2. **Read the existing or proposed script** with `read_card_script` to understand which functions and effects should be exercised.
3. **Get test context** with `get_script_test_context` to obtain the CDB path, script directory, test-plan path, and built-in helper script names.
4. **Write the test plan** in one `propose_script_test_plan` call. The plan is temporary JSON saved under `.dey/ai-tests/c{code}.test-plan.json` after user confirmation.

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

Supported check kinds:
- `load-script` — preload the card script into the duel (code defaults to cardCode).
- `start-duel` — start the duel with the configured seed/start options.
- `advance` — advance the duel up to `maxSteps` (1-500, default 80) silent steps.
- `assert-no-redtext` — fail if any script error was logged.
- `assert-lp` — assert a player's LP equals a value: `{ "player": 0, "equals": 8000 }`.
- `assert-field-count` — assert a location count: `{ "player": 0, "location": "mzone", "equals": 1 }` (supports `min`/`max` instead of `equals`).

Supported locations: `deck`, `hand`, `mzone`, `szone`, `grave`, `removed`, `banished`, `extra`.
Supported positions: `faceup_attack`, `facedown_attack`, `faceup_defense`, `facedown_defense`.

## Setup Cards

Each setup card places one card on the field before checks run:

```json
{ "code": 12345678, "controller": 0, "owner": 0, "location": "mzone", "sequence": 0, "position": "faceup_attack" }
```

- `controller` / `owner`: 0 or 1 (owner defaults to controller).
- `sequence`: zone index, defaults to 0.
- Scripts for all setup cards are auto-included; you do not need to list them in `includeScripts`.

## Runner Behavior

- The runner uses the current CDB, preloads built-in `constant.lua`, `utility.lua`, and `procedure.lua`, and also loads non-card helper scripts from the configured script directory when present.
- `includeScripts` loads additional card scripts beyond the target and setup cards.
- `seed` may be a number or an array of numbers (up to 8) for deterministic duel randomness.
- `start` may be a number or an object passed to `startDuel`.

## Constraints

- Only propose a complete JSON test plan — never TypeScript code.
- Do not write the real file; always use `propose_script_test_plan`.
- Do not write tests outside `.dey`; the runner only reads `.dey/ai-tests`.
- Cover at least `load-script` plus one assertion when practical.
- If the card effect is too complex to assert with the available check kinds, write a minimal `load-script` + `assert-no-redtext` plan and note the limitation in the response.
