use tauri::AppHandle;

use crate::{services, AppendErrorLogRequest, PendingOpenCdbPaths};

#[tauri::command]
pub(crate) fn append_error_log(
    app: AppHandle,
    request: AppendErrorLogRequest,
) -> Result<String, String> {
    services::logging::append_error_log(&app, request)
}

#[tauri::command]
pub(crate) fn consume_pending_open_cdb_paths(
    state: tauri::State<'_, PendingOpenCdbPaths>,
) -> Result<Vec<String>, String> {
    let mut pending = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire pending cdb paths".to_string())?;
    Ok(std::mem::take(&mut *pending))
}
