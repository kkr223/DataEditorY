# src/lib/core/workspace/

## Responsibility

Workspace Abstraction — defines a unified projection of platform documents and legacy state. The shell filters this projection so top-level app tabs show CDB workspaces only; Script/Image/AI are normally child surfaces under the active CDB workspace.

## Design

### Types (`types.ts`)

- `WorkspaceKind` — `'db' | 'script' | 'settings' | 'card-image'`
- `WorkspaceDocumentBase` — common interface: `id`, `kind`, `title`, `subtitle`, `dirty`, `status`, `savePolicy`, `closeGuard`, `source`, `viewState`
- Specialized variants: `DbWorkspaceDocument`, `ScriptWorkspaceDocument`, `SettingsWorkspaceDocument`, `CardImageWorkspaceDocument`
- `WorkspaceSnapshot` — array of documents + active document ID

### Projection (`projection.ts`)

Transforms platform-level `DocumentRuntimeSnapshot` and legacy store state into a unified `WorkspaceSnapshot`. CDB documents are the shell tab source; script/card-image projections exist for lifecycle compatibility and child-surface ownership.

### Store (`store.svelte.ts`)

Svelte reactive store that subscribes to all document sources and produces a live `WorkspaceSnapshot`. Provides:
- `getActiveWorkspaceDocument()`, `getWorkspaceDocument(id)`
- Reactive derivations for the tab bar and workspace host

## Integration

- **Consumed by**: application (`commandBus`, `lifecycle`), platform (`WorkbenchHost`), features (shell tab bar)
- **Depends on**: stores (`tabs`, `scriptEditor`, `appShell`), platform (`documentRuntime`)
- **Related helpers**: `cdbPathIdentity.ts` normalizes CDB paths for tab/script identity; `cdbEditorSnapshot.ts` restores per-CDB explorer and selection state.
