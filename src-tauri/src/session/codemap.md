# src-tauri/src/session/

## Responsibility

CDB Session Management — manages the lifecycle of open CDB workspace connections, including temporary working copies, connection pooling, save path updates, and cleanup.

## Design

### `cdb.rs`

- `OpenCdbSessions` — `Mutex<HashMap<String, CdbSessionMeta>>` mapping CDB workspace/session IDs to session metadata
- `CdbSessionMeta` — holds: original `path`, `working_path` (temp copy), `cdb: Arc<Mutex<YgoProCdb>>` (connection), `name`
- Helper functions:
  - `app_temp_dir(app)` — resolves the app's temp directory
  - `build_temp_path_in_dir(dir, name)` — generates unique temp file path
  - `canonicalize_path(path)` — normalizes path for cross-platform consistency
  - `basename(path)` — extracts filename
  - `with_session_meta(sessions, tab_id, f)` — safely accesses a session under lock
  - `replace_session`, `remove_session`, `update_session_path` — session CRUD
  - `cleanup_temp_path(path)` — deletes temp file on session close
  - `ensure_parent_dir(path)` — creates parent directories for save targets

## Integration

- **Consumed by**: `services/cdb_session`, `services/cdb_cards`, `document_host/cdb`
- **Depends on**: `ygopro-cdb-encode-rs::YgoProCdb`
