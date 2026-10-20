# src/lib/features/workspace-metadata/

## Responsibility

Owns the shared `.dey` metadata state and persistence pipeline independently of workbench components.

## State and Persistence

- `state.svelte.ts` — single reactive metadata instance, scoped loads, debounced writes, per-path serialization, failure retention/retry, Save As, and shutdown flushing.
- `updateWorkspaceMetadata` edits the current loaded workspace; `updateWorkspaceMetadataForPath` serializes background read/modify/write operations without changing the active workspace.
- `captureWorkspaceMetadataScope` invalidates asynchronous owners after switching away, including away-and-back transitions.
- Failed writes retain their snapshot until persisted; flush rejects on failure. Newer queued snapshots take precedence over older responses.

## Integration

- Depends on typed `native/metadataApi.ts` and CDB path identity.
- Consumed by AI state, shell shutdown, CDB Save As, workbench accessors, and the metadata error banner.
- `modules/card/workbench/workspaceMetadataState.svelte.ts` retains compatibility exports; it shares this state and does not create another instance.
- Persistence and workbench integration regressions live in `modules/card/workbench/workspaceMetadataState.test.ts`.
