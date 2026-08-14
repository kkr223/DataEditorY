use serde_json::Value;

use crate::services;

#[tauri::command]
pub(crate) fn load_workspace_metadata(cdb_path: String) -> Result<Value, String> {
    services::metadata::load_workspace_metadata(cdb_path)
}

#[tauri::command]
pub(crate) fn save_workspace_metadata(
    cdb_path: String,
    metadata: Value,
    source_cdb_path: Option<String>,
) -> Result<Value, String> {
    services::metadata::save_workspace_metadata(cdb_path, metadata, source_cdb_path)
}
