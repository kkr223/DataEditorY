# src/lib/modules/card/workbench/

## Responsibility

Card Collection Workbench — the CDB workspace UI. It composes Card Explorer, the compact surface rail, and the active surface (`Card`, `Script`, `Image`, or `AI`).

## Components

- `CardCollectionWorkbench.svelte` — main CDB workspace layout; owns explorer collapse/pin behavior and routes the active surface.
- `CardSurfaceRail.svelte` — vertical current-card surface tabs.
- `ScriptSurface.svelte` — current-card Lua editor surface with internal script tabs.
- `ImageSurface.svelte` — current-card image preview/config/export surface backed by `yugioh-card-ts`.
- `AiSurface.svelte` — workspace AI surface showing context, tool calls, results, proposals, and diffs.
- `context.ts` — workbench context provider for active CDB/card state.

## State Helpers

- `surfaceState.svelte.ts` — active surface and layout state, persisted through metadata.
- `cardDraftWorkspaceState.svelte.ts` — per-workspace card draft state.
- `workspaceMetadataState.svelte.ts` — `.dey` metadata load/save bridge.
- `aiContextRefs.ts`, `aiProposalPayload.ts`, `aiProposalDiff.ts`, `aiProposalApplication.svelte.ts` — AI proposal context, parsing, diff, and explicit apply boundaries.
