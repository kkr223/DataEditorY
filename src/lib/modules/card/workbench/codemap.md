# src/lib/modules/card/workbench/

## Responsibility

Card Collection Workbench — the CDB workspace UI. It composes Card Explorer, the compact surface rail, and the active surface (`Card`, `Script`, `Image`, or `AI`).

## Components

- `CardCollectionWorkbench.svelte` — main CDB workspace layout; restores Explorer filters and selection before enabling script restoration or persisting workspace state, owns explorer collapse/pin behavior, and routes the active surface. Async restoration is scoped to the active CDB session.
- `CardSurfaceRail.svelte` — vertical current-card surface tabs.
- `ScriptSurface.svelte` — current-card Lua editor surface with internal script tabs; waits for Explorer selection restoration, restores saved scripts per CDB session, then enables current-card script opening and script-state persistence.
  Returning to a CDB preserves its last active script independently of Explorer selection; subsequent card changes follow the selected card. Async activation is cancelled when its workspace is left during buffer synchronization.
  Internal Lua tabs support pointer drag sorting within the CDB; their ordered list is persisted through the existing script surface metadata.
- `ImageSurface.svelte` — current-card image preview/config/export surface backed by `yugioh-card-ts`.
  Uses only the selected card's matching draft, keys editors by CDB session and card, and rejects changes emitted by an old editor or a mismatched metadata workspace.
- `AiSurface.svelte` — workspace AI surface showing `@card` context, tool calls, results, proposals, and diffs.
  Async runs are scoped to the CDB load generation and thread; late results cannot populate another workspace. Proposal apply logs retain their original metadata owner, and persisted targets resolve the live document by CDB path.
- `context.ts` — workbench context provider for active CDB/card state.

## State Helpers

- `surfaceState.svelte.ts` — active surface and layout state, persisted through metadata.
- `cardDraftWorkspaceState.svelte.ts` — per-workspace card draft state.
- `workspaceMetadataState.svelte.ts` — `.dey` metadata load/save bridge; Save As preserves referenced workspace image assets.
  Per-path queues serialize complete background read/modify/write transactions. Failed loads remain unready, preventing empty autosaves; window shutdown flushes all pending queues.
- `aiMentions.ts` — pure text helpers for AI composer `@card` detection, replacement, deletion, and prompt context.
- `aiContextRefs.ts`, `aiProposalPayload.ts`, `aiProposalDiff.ts`, `aiProposalApplication.svelte.ts` — AI proposal context, parsing, diff, and explicit apply boundaries.
  Draft application is bound to workspace ID, card ID and revision, and never replaces an already dirty draft.
