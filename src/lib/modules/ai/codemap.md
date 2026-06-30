# src/lib/modules/ai/

## Responsibility
AI Module — provides AI session plumbing, settings section, and the workspace-level AI surface entry.

## Design
- `AI_SESSION_TYPE` with `PersistentMemoryProvider` for compatibility with the platform runtime
- `ai.settings` section adds AI configuration to settings panel
- `ai.card-surface` contributes the vertical rail AI surface to `card.workbench`
- Agent behavior lives in `features/ai/service.ts`, with read-only context tools and sandbox proposal tools
- Proposal review/apply, full-access auto-apply, and `@card` context mentions live in `modules/card/workbench/AiSurface.svelte`
- Built-in skills are Markdown files under `static/resources/ai-skills/`

## Integration
- **Depends on**: `card`, `lua`, `settings`
- **Contributes to**: `card.workbench`, settings sections
- **Boundary**: AI creates auditable proposals in `.dey`; agent tools do not directly write CDB/script/image state. Review mode asks before applying, while full access can auto-apply through the same apply pipeline.
