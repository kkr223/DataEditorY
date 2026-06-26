# src-tauri/src/

## Responsibility

Rust Backend — Tauri 2 application backend providing CDB session management, file operations, metadata persistence, packaging, merging, Lua replace, asset checks, settings persistence, and a document host protocol for structured frontend-backend communication.

## Design

### Architecture Layers

```
commands/          → Tauri #[tauri::command] handlers (API surface)
document_host/     → Structured CDB document protocol (query/execute/undo/save)
services/          → Business logic and task orchestration
session/           → CDB working-copy connection lifecycle
repository/        → CDB access through ygopro-cdb-encode-rs
models/            → Data transfer objects
```

### Entry Points

- **`main.rs`** — Tauri entry point, calls `run()`
- **`lib.rs`** — app setup: registers URI scheme, manages state, configures plugins (dialog, fs, opener, single-instance), registers all command handlers

### State Management

Three `Mutex`-wrapped state objects managed by Tauri:
1. `PendingOpenCdbPaths` — queued `.cdb` paths from file associations / CLI args
2. `OpenCdbSessions` — active CDB workspace connections (working copies)
3. `DocumentHostState` — undo stacks per document

### Key Constants

- `SETTINGS_FILE_NAME` = `settings.json`
- `DEFAULT_SCRIPT_TEMPLATE` — Lua script boilerplate
- `DEFAULT_AI_MODEL` = `gpt-4o-mini`
- `DEFAULT_PACKAGE_INCLUDE_PATTERNS` — patterns for ZIP packaging

## Integration

- **Consumed by**: Frontend typed APIs and document host client via Tauri IPC
- **Depends on**: `ygopro-cdb-encode-rs` (CDB encoding), `rusqlite` transitively through the CDB library, `image` (image processing), `zip` (packaging), `aes-gcm`/`sha2` (crypto), Tauri plugins
- **Sub-maps**: [commands/](commands/codemap.md) | [document_host/](document_host/codemap.md) | [services/](services/codemap.md) | [session/](session/codemap.md) | [repository/](repository/codemap.md) | [models/](models/codemap.md)
