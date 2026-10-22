# src/lib/modules/card/workbench/

## Responsibility

Card Collection Workbench — the CDB workspace UI. It composes Card Explorer, the compact surface rail, and the active surface (`Card`, `Script`, `Image`, or `AI`).

## Components

- `CardCollectionWorkbench.svelte` — main CDB workspace layout; restores Explorer filters and selection before enabling script restoration or persisting workspace state, owns explorer collapse/pin behavior, and routes the active surface. Async restoration is scoped to the active CDB session.
- `CardSurfaceRail.svelte` — vertical current-card surface tabs; explicit Lua clicks queue opening the selected card's script, creating it from the configured template when missing.
- `ScriptSurface.svelte` — current-card Lua editor surface with internal script tabs; waits for Explorer selection restoration, restores saved scripts per CDB session, then enables current-card script opening and script-state persistence.
  Returning to a CDB preserves its last active script independently of Explorer selection; subsequent card changes follow the selected card. Async activation is cancelled when its workspace is left during buffer synchronization.
  Internal Lua tabs support pointer drag sorting within the CDB; their ordered list is persisted through the existing script surface metadata.
  LoadScript dependencies share these tabs, use their actual filenames, and persist their paths and active path. Helper scripts have no card association (`cardCode: 0`); save/reload/close and split editing use the same document lifecycle as card scripts.
  Explicit script-open requests wait for Explorer and script restoration, then take precedence over the restored active script. Background creation and guarded activation prevent late completions from changing another card or workspace.
  Tab context menus can pair the active script with another script. The pair appears as one tab with two close buttons; closing either restores the survivor to the ordinary editor.
- `ImageSurface.svelte` — current-card image preview/config/export surface backed by `yugioh-card-ts`.
  Uses only the selected card's matching draft, keys editors by CDB session and card, and rejects changes emitted by an old editor or a mismatched metadata workspace.
- `AiSurface.svelte` — workspace AI surface showing `@card` context, tool calls, results, proposals, and diffs.
  Async runs are scoped to the CDB load generation and thread; late results cannot populate another workspace. Proposal apply logs retain their original metadata owner, and persisted targets resolve the live document by CDB path.
- `AiProposalInspector.svelte` — proposal review/diff panel, including responsive layout; receives proposals and an apply callback without owning persistence.
- `aiProposalExecution.ts` — workbench adapter for card, script and image proposal writes. Resolves the live CDB by path, routes cards through guarded document host commands, and prioritizes open script buffers over disk.
- `WorkspaceMetadataStatus.svelte` — visible metadata load/save failures and explicit retry; failed snapshots remain queued until successfully persisted.
- `context.ts` — workbench context provider for active CDB/card state.

## State Helpers

- `surfaceState.svelte.ts` — active surface and layout state, persisted through metadata.
- `cardDraftWorkspaceState.svelte.ts` — per-workspace card draft state and registered draft committers used before context-menu navigation/selection changes.
- `workspaceMetadataState.svelte.ts` — workspace UI, image, card-group and task accessors; compatibility exports for the shared metadata state and AI operations.
  Persistence lives in `features/workspace-metadata/state.svelte.ts`; AI DTOs and operations live in `features/ai/types.ts` and `workspaceState.ts`. All consumers share one metadata state.
- `aiMentions.ts` — pure text helpers for AI composer `@card` detection, replacement, deletion, and prompt context.
- `aiContextRefs.ts`, `aiProposalPayload.ts`, `aiProposalDiff.ts`, `aiProposalApplication.svelte.ts` — AI proposal context, parsing, diff, and explicit apply boundaries.
  Draft application is bound to workspace ID, card ID and revision, and never replaces an already dirty draft.
- `aiCardChanges.ts` — applies only proposed fields over current cards; conflicts require review in every authorization mode. Passes exact read snapshots to the host for atomic batch validation; ID changes use the card editor's asset migration flow.
