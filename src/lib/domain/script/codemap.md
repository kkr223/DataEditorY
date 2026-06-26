# src/lib/domain/script/

## Responsibility

Script Workspace Domain — pure logic for Lua script content normalization and CDB-aware script tab identity.

## Design

- `workspace.ts` — manages script workspace state: content tracking, dirty detection, normalization of generated scripts
- `tabIdentity.ts` — normalizes script tab keys using source CDB identity so equivalent CDB paths do not create duplicate `c{id}.lua` tabs
- `normalizeGeneratedScript(content)` — normalizes whitespace and line endings for comparison
- Used by Script surface, AI proposals, and script save/restore flows

## Integration

- **Consumed by**: `features/script-editor/`, `features/ai/service.ts`, `modules/card/workbench/ScriptSurface.svelte`, stores
- **Depends on**: none (pure logic)
