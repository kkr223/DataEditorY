# src/lib/features/ai/

## Responsibility

AI Integration Feature — provides workspace-level LLM assistance with visible context, tool calls, result summaries, and user-confirmed proposals. AI must not directly write CDB data, scripts, or image metadata.

## Design

### Service (`service.ts`)

A workspace AI service:
- **OpenAI-compatible API client** — configurable base URL, model, temperature, encrypted API key
- **Tool-calling agent loop** — iterates: send messages → receive tool calls → execute tools → send results → repeat until done
- **Agent stages**: `collecting_references` → `requesting_model` → `running_tools` → `finalizing_response`
- **Read tools**: inspect/search opened CDB, card, script, and image context
- **Sandbox proposal tools**: prepare card, batch-card, script, and image patches; mutation is applied only after user confirmation

### Context (`context.ts`)

Builds AI context from current app state:
- Current card data, selection state, database cards
- Open database summaries
- Script and image config readers

### Skills

Built-in skills live under `static/resources/ai-skills/` and restrict the tools available for a request.

## Integration

- **Consumed by**: `modules/card/workbench/AiSurface.svelte`, `modules/ai/workbench/`
- **Depends on**: stores, domain (`card/`, `script/`), settings for API key
