use tauri::AppHandle;

use crate::{services, AppendErrorLogRequest, ExternalOpenPaths, PendingExternalOpenPaths};

#[tauri::command]
pub(crate) fn append_error_log(
    app: AppHandle,
    request: AppendErrorLogRequest,
) -> Result<String, String> {
    services::logging::append_error_log(&app, request)
}

#[tauri::command]
pub(crate) fn consume_pending_open_cdb_paths(
    state: tauri::State<'_, PendingExternalOpenPaths>,
) -> Result<Vec<String>, String> {
    let mut pending = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(std::mem::take(&mut pending.cdb_paths))
}

#[tauri::command]
pub(crate) fn consume_pending_external_open_paths(
    state: tauri::State<'_, PendingExternalOpenPaths>,
) -> Result<ExternalOpenPaths, String> {
    let mut pending = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(std::mem::take(&mut *pending))
}
