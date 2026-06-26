# src/lib/application/workspace/

## Responsibility

Workspace Command Bus and Lifecycle — routes workspace-level commands (open, close, save, activate) to the correct handler and manages dirty/save/close lifecycle concerns. The shell exposes CDB documents as top-level tabs; script/image/AI state is usually owned by the active CDB surface.

## Design

### Command Bus (`commandBus.ts`)

Central dispatcher that routes workspace actions by document type:
- **`openSettingsWorkspace()`** — creates or activates settings document
- **`openDbWorkspace()`** / **`createDbWorkspace()`** — opens/creates CDB via file dialog
- **`activateWorkspaceDocument(id)`** — routes to settings, compatibility document activation, or CDB tab activation
- **`closeWorkspaceDocument(id)`** — routes to appropriate close handler with dirty confirmation, including child script cleanup when closing a CDB
- **`saveWorkspaceDocument(id)`** — routes to custom save handler, focused script save, compatibility save, or CDB save
- **`saveActiveWorkspaceDocument()`** — saves the currently active workspace

### Lifecycle (`lifecycle.ts`)

Manages workspace document metadata overlays:
- **`setWorkspaceLifecycleMetadata(id, metadata)`** — sets dirty/status/savePolicy/closeGuard overrides
- **`resolveWorkspaceLifecycleDocument(document)`** — merges lifecycle metadata into workspace document
- **Save handlers** — per-workspace custom save functions via `setWorkspaceSaveHandler`
- **Close confirmation** — `shouldConfirmWorkspaceClose`, `confirmDirtyPrompt` via Tauri dialog

## Integration

- **Consumed by**: features (shell, shortcuts), stores, routes, CDB surfaces
- **Depends on**: stores (`db`, `appShell`, `scriptEditor`), platform (`appRuntime`, `documentRuntime`), modules (`settings`, `card-image`), infrastructure (Tauri dialogs)
