# src/lib/domain/card/

## Responsibility

Card Domain Model — defines YGOPro card taxonomy, setcode encoding/decoding, draft state, validation, and batch edit semantics.

## Design

### Taxonomy (`taxonomy.ts`)

Static lookup maps for all YGOPro card classification systems:
- `TYPE_MAP` — main types: monster (0x1), spell (0x2), trap (0x4)
- `ATTRIBUTE_MAP` — 7 attributes: earth, water, fire, wind, light, dark, divine
- `RACE_MAP` — 26 races: warrior, spellcaster, dragon, cyberse, illusion, etc.
- `SUBTYPE_MAP` — subtypes/mechanics: normal, effect, fusion, ritual, synchro, xyz, pendulum, link, etc.
- `LINK_MARKER_NAME_TO_BIT` — 8 link marker positions as bitmask values
- UI option arrays (`TYPE_OPTIONS`, `ATTRIBUTE_OPTIONS`, `RACE_OPTIONS`, `SUBTYPE_OPTIONS`, `LINK_MARKER_OPTIONS`) for dropdown/checkbox rendering
- Mask constants: `SPELL_SUBTYPE_MASK`, `TRAP_SUBTYPE_MASK` for distinguishing spell/trap subtypes

### Setcode (`setcode.ts`)

Encodes/decodes the YGOPro setcode (archetype) field — a 64-bit integer packed with up to 4 setcode values (16 bits each).
- `encodeSetcodes(values: number[]): number[]` — packs up to 4 values
- `decodeSetcodes(encoded: number[]): number[]` — unpacks
- Handles the 2-element `[low, high]` array format used by the CDB schema

### Draft (`draft.ts`)

Card draft state management for the editor:
- `createEmptyCard()` — factory for blank card entries
- `cloneEditableCard(card)` — deep clone preserving all 17+ fields
- `areCardsEquivalent(a, b)` — structural equality check for dirty detection
- Snapshot serialization for undo support

### Validation (`validation.ts`)

Validates card drafts before committing them to the CDB working copy. Severe errors block commit; warnings are allowed.

### Batch Operations (`batchOperations.ts`)

Pure helpers for CDB batch edit previews and apply semantics. Operation groups are ordered, card groups are resolved to snapshots before execution, and empty values normalize through field-specific rules.

## Files

| File | Purpose |
|------|---------|
| `taxonomy.ts` | All card type/attribute/race/subtype constants and UI option arrays |
| `setcode.ts` | Setcode (archetype) encoding/decoding utilities |
| `draft.ts` | Card draft creation, cloning, and equivalence checking |
| `validation.ts` | Draft validation errors and warnings |
| `batchOperations.ts` | Batch field edit operation normalization and preview helpers |

## Integration

- **Consumed by**: search query builder, card editor features, AI service, stores
- **Depends on**: `$lib/types` (CardDataEntry, BitOption, SelectOption)
