use tauri::{AppHandle, Emitter};

use crate::{load_persisted_settings, services, ZipPackageInfo, BACKGROUND_TASK_PROGRESS_EVENT};

#[tauri::command]
pub(crate) async fn package_cdb_assets_as_zip(
    app: AppHandle,
    cdb_path: String,
    output_path: String,
) -> Result<ZipPackageInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let progress_app = app.clone();
        let settings = load_persisted_settings(&app)?;
        services::package::package_cdb_assets_as_zip_with_progress(
            cdb_path,
            output_path,
            settings.package_include_patterns,
            &mut |payload| {
                let _ = progress_app.emit(BACKGROUND_TASK_PROGRESS_EVENT, &payload);
            },
        )
    })
    .await
    .map_err(|err| err.to_string())?
}
