# src-tauri/src/session/

## Responsibility

CDB Session Management — manages the lifecycle of open CDB workspace connections, including temporary working copies, connection pooling, save path updates, and cleanup.

## Design

### `cdb.rs`

- `OpenCdbSessions` — `Mutex<HashMap<String, Arc<CdbSessionMeta>>>` mapping CDB workspace/session IDs to shared session owners
- `CdbSessionMeta` — owns the path mutex, connection mutex and temporary working file; the last owner closes SQLite before deleting the working file and sidecars
- `TemporaryCdbFile` — RAII cleanup for working copies and save staging files, including failed open/create/save operations
- Helper functions:
  - `app_temp_dir(app)` — resolves the app's temp directory
  - `build_temp_path_in_dir(dir, name)` — generates unique temp file path
  - `canonicalize_path(path)` — normalizes path for cross-platform consistency
  - `basename(path)` — extracts filename
  - `with_session_meta(sessions, tab_id, f)` — clones the session owner under the map lock, then releases that lock before database access or disk I/O
  - `replace_session`, `remove_session` — session CRUD
  - `cleanup_temp_path(path)` — deletes temp file on session close
  - `ensure_parent_dir(path)` — creates parent directories for save targets

## Integration

- **Consumed by**: `services/cdb_session`, `services/cdb_cards`, `document_host/cdb`
- **Depends on**: `ygopro-cdb-encode-rs::YgoProCdb`
