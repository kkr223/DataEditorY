# src-tauri/src/commands/

## Responsibility

Tauri Command Handlers — the API surface exposed to the frontend via `#[tauri::command]`. Each module groups related commands.

## Modules

| Module | Commands | Purpose |
|--------|----------|---------|
| `cdb.rs` | `create_cdb_from_cards`, `copy_card_assets`, `analyze_cdb_merge`, `collect_merge_sources_from_folder`, `execute_cdb_merge` | CDB creation, asset copying, merge analysis and execution |
| `media.rs` | `read_cdb`, `write_cdb`, `read_text_file`, `write_file`, `path_exists`, `list_image_folder_entries`, `read_lua_helper_scripts`, `read_builtin_lua_helper_scripts`, `copy_image`, `read_image`, `import_card_image`, `load_strings_conf`, `open_in_system_editor`, `open_in_default_app` | File I/O, image operations, string resource loading |
| `scripts.rs` | `get_card_script_info`, `read_card_script`, `write_card_script`, `save_card_script` | Lua script file management relative to CDB path |
| `metadata.rs` | `load_workspace_metadata`, `save_workspace_metadata`, `backup_workspace_metadata` | `.dey/{cdb-stem}.workspace.json` metadata persistence |
| `lua_replace.rs` | preview/apply Lua search-replace commands | CDB-level Lua migration task support |
| `assets_check.rs` | asset check commands | CDB-level resource validation |
| `settings.rs` | `load_app_settings`, `save_app_settings`, `load_secret_key`, `set_cover_image`, `clear_cover_image` | App settings persistence, API key encryption, cover image |
| `package.rs` | `package_cdb_assets_as_zip` | ZIP/YPK packaging of CDB + associated resources |
| `app.rs` | `append_error_log`, `consume_pending_open_cdb_paths` | Error logging, file association queue consumption |

## Design

Commands are thin wrappers that:
1. Validate and deserialize input
2. Delegate to `services/` for business logic
3. Return serialized results or error strings

## Integration

- **Consumed by**: Frontend typed APIs in `src/lib/native/` and the document host client
- **Depends on**: `services/`, `session/`, `repository/`, `models/`
