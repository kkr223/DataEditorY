# src/lib/modules/ai/

## Responsibility
AI Module — provides AI session plumbing, settings section, and the workspace-level AI surface entry.

## Design
- `AI_SESSION_TYPE` with `PersistentMemoryProvider` for compatibility with the platform runtime
- `ai.settings` section adds AI configuration to settings panel
- `ai.card-surface` contributes the vertical rail AI surface to `card.workbench`
- Agent behavior lives in `features/ai/service.ts`, with read-only context tools and sandbox proposal tools
- Proposal review/apply lives in `modules/card/workbench/AiSurface.svelte`
- Built-in skills are Markdown files under `static/resources/ai-skills/`

## Integration
- **Depends on**: `card`, `lua`, `settings`
- **Contributes to**: `card.workbench`, settings sections
- **Boundary**: AI creates auditable proposals in `.dey`; it must not directly write CDB/script/image state before user confirmation.
