# src-tauri/src/services/

## Responsibility

Rust Business Services — service functions implementing CDB sessions, metadata, packaging, merge, Lua replace, asset checks, and file/settings operations.

## Modules

| Module | Purpose |
|--------|---------|
| `cdb_session.rs` | CDB session lifecycle: `open_cdb_tab` (copies to temp dir), `create_cdb_tab`, `close_cdb_tab` (cleanup), `save_cdb_tab_to` (atomic copy via temp file + rename). Also: `create_unsaved_cdb_tab`, `merge_cdb_sessions` |
| `cdb_cards.rs` | Card CRUD operations on open sessions: `search_cards_page` (paginated search), `get_card_by_id`, `get_cards_by_ids`, `modify_cards`, `delete_cards`, `query_cards_raw`, `undo_modify_operation` |
| `merge.rs` | CDB merge: `analyze_merge` (duplicate detection, asset coverage analysis), `execute_merge` (combine cards, copy images/scripts with priority) |
| `package.rs` | ZIP/YPK packaging: collects CDB + `pics/` + `script/` + `strings.conf`, compresses with deflate |
| `media.rs` | Media operations: `handle_media_protocol_request` (custom URI scheme for serving local images), `collect_cdb_paths_from_args` (CLI arg parsing), image reading/conversion/import |
| `scripts.rs` | Script file management: resolve script path from CDB location, read/write/save `.lua` files, template-based creation |
| `metadata.rs` | Workspace metadata: load/save/backup `.dey/{cdb-stem}.workspace.json`; missing metadata returns an empty workspace shape |
| `lua_replace.rs` | Lua search/replace preview and apply support for CDB-level migration tasks |
| `assets_check.rs` | Resource validation for CDB-related pics/scripts/assets |
| `settings.rs` | App settings: load/save JSON settings, API key encryption/decryption, cover image management |
| `crypto.rs` | AES-GCM encryption for API keys with machine-specific key derivation |
| `logging.rs` | Error log file management |
| `assets.rs` | Resource path resolution for bundled assets |
| `app_config.rs` | App configuration paths and directory resolution |

## Design Patterns

- **Working Copy Pattern** (`cdb_session.rs`): Every opened CDB is copied to a temp directory. All edits happen on the copy. Save writes the copy back to the original path atomically (temp file + rename).
- **Atomic Save**: Uses `file.cdb.tmp` → `rename(file.cdb)` to prevent corruption on interrupted writes.
- **Metadata Separation**: `.dey` files store editor state only; CDB facts, script contents, image binaries, API keys, and large caches stay out.
- **Background Progress Events**: Merge and package operations emit `background-task-progress` events via Tauri for frontend progress display.

## Integration

- **Consumed by**: `commands/`, `document_host/`
- **Depends on**: `repository/cdb`, `session/cdb`, `models/`, `ygopro-cdb-encode-rs`
