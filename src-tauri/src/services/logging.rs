use std::{fs, io::Write};

use tauri::AppHandle;

use crate::{error_log_path, now_local_timestamp, AppendErrorLogRequest};

pub fn append_error_log(app: &AppHandle, request: AppendErrorLogRequest) -> Result<String, String> {
    let path = error_log_path(app)?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|err| err.to_string())?;

    writeln!(file, "[{}] {}", now_local_timestamp(), request.source)
        .map_err(|err| err.to_string())?;
    writeln!(file, "message: {}", request.message).map_err(|err| err.to_string())?;

    if let Some(stack) = request.stack.filter(|value| !value.trim().is_empty()) {
        writeln!(file, "stack:\n{}", stack).map_err(|err| err.to_string())?;
    }

    if let Some(extra) = request.extra.filter(|value| !value.trim().is_empty()) {
        writeln!(file, "extra: {}", extra).map_err(|err| err.to_string())?;
    }

    writeln!(file).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
