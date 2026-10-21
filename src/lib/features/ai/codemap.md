# src/lib/features/ai/

## Responsibility

AI Integration Feature — provides workspace-level LLM assistance with visible context, tool calls, result summaries, and auditable proposals. Agent tools must not directly write CDB data, scripts, or image metadata; writes go through the workbench apply pipeline.

## Design

### Service (`service.ts`)

A workspace AI service:
- **OpenAI-compatible API client** — configurable base URL, model, temperature, encrypted API key
- **Tool-calling agent loop** — iterates: send messages → receive tool calls → execute tools → send results → repeat until done
- **Agent stages**: `collecting_references` → `requesting_model` → `running_tools` → `finalizing_response`
- **Read tools**: inspect/search opened CDB, card, script, and image context
- **Sandbox proposal tools**: prepare card, batch-card, script, and image patches; review mode applies after user confirmation, while full access can auto-apply through the same proposal path
- **Script test runner**: implementation is retained but currently hidden from the AI workbench and excluded from agent prompts/tools

### Context (`context.ts`)

Builds AI context from current app state:
- Current card data, selection state, database cards
- Open database summaries
- Script and image config readers
- Configured script directory for script lookup and helper loading
- Request ownership pins the active CDB and selection; open script buffers take precedence over disk reads
- `scriptBaseline.ts` stores only file existence and a SHA-256 digest in script proposals. Apply checks this baseline and asks for confirmation if the script changed or an older proposal has no baseline.

### Skills

Built-in skills live under `static/resources/ai-skills/` and restrict the tools available for a request. Editing or adding a skill copies it into `<app config>/ai-resources/ai-skills/`, tracked by `user-manifest.json`; the user copy overrides the bundled file at runtime. Prompts use the same mechanism under `ai-prompts/`.

### State and Proposal Application

- `types.ts` — shared AI thread, message, tool, proposal, patch and status DTOs. Services and pure helpers import these without depending on a Svelte workbench store.
- `workspaceState.ts` — AI thread/message/tool/proposal operations over the shared metadata persistence module. Thread updates merge omitted fields and retain cumulative token usage.
- `proposalApplication.ts` — serial proposal application, per-patch audit results, partial-failure status, and duplicate-submit guard. Captures metadata ownership and authorization mode at the start. Persistence failures propagate and always release the guard.
- `scriptChanges.ts` — baseline comparison and a second read after conflict confirmation, injected through read/confirm/write operations so the flow is independently testable.
- Workbench adapters connect these use cases to document host commands, live script buffers and image metadata. The proposal inspector only displays data and calls an apply callback.

## Integration

- **Consumed by**: `modules/card/workbench/AiSurface.svelte`, `modules/ai/workbench/`
- **Depends on**: stores, domain (`card/`, `script/`), settings for API key
