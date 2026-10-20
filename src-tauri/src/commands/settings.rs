use tauri::AppHandle;

use crate::{services, AppSettingsPayload, SaveAppSettingsRequest};

#[tauri::command(async)]
pub(crate) fn load_app_settings(app: AppHandle) -> Result<AppSettingsPayload, String> {
    services::settings::load_app_settings(&app)
}

#[tauri::command(async)]
pub(crate) fn save_app_settings(
    app: AppHandle,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsPayload, String> {
    services::settings::save_app_settings(&app, request)
}

#[tauri::command(async)]
pub(crate) fn load_secret_key(app: AppHandle) -> Result<Option<String>, String> {
    services::settings::load_secret_key(&app)
}

#[tauri::command(async)]
pub(crate) fn set_cover_image(app: AppHandle, source_path: String) -> Result<String, String> {
    services::settings::set_cover_image(&app, source_path)
}

#[tauri::command(async)]
pub(crate) fn clear_cover_image(app: AppHandle) -> Result<(), String> {
    services::settings::clear_cover_image(&app)
}
