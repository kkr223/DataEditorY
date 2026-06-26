use serde_json::Value;

use crate::services;

#[tauri::command]
pub(crate) fn load_workspace_metadata(cdb_path: String) -> Result<Value, String> {
    services::metadata::load_workspace_metadata(cdb_path)
}

#[tauri::command]
pub(crate) fn save_workspace_metadata(cdb_path: String, metadata: Value) -> Result<Value, String> {
    services::metadata::save_workspace_metadata(cdb_path, metadata)
}

#[tauri::command]
pub(crate) fn backup_workspace_metadata(cdb_path: String) -> Result<Option<String>, String> {
    services::metadata::backup_workspace_metadata(cdb_path)
}
