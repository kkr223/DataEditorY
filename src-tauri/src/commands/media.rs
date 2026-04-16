use tauri::AppHandle;

use crate::services;

#[tauri::command]
pub(crate) fn read_cdb(path: String) -> Result<Vec<u8>, String> {
    services::media::read_cdb(path)
}

#[tauri::command]
pub(crate) fn read_text_file(path: String) -> Result<String, String> {
    services::media::read_text_file(path)
}

#[tauri::command]
pub(crate) fn write_cdb(path: String, data: Vec<u8>) -> Result<(), String> {
    services::media::write_cdb(path, data)
}

/// Generic file-write command 鈥?identical to write_cdb but with a clearer
/// name for non-database file writes (images, scripts, exports, etc.).
#[tauri::command]
pub(crate) fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    services::media::write_file(path, data)
}

#[tauri::command]
pub(crate) fn path_exists(path: String) -> Result<bool, String> {
    services::media::path_exists(path)
}

#[tauri::command]
pub(crate) fn list_image_folder_entries(path: String) -> Result<Vec<String>, String> {
    services::media::list_image_folder_entries(path)
}

#[tauri::command]
pub(crate) fn copy_image(src: String, dest: String) -> Result<(), String> {
    services::media::copy_image(src, dest)
}

#[tauri::command]
pub(crate) fn read_image(path: String) -> Result<Vec<u8>, String> {
    services::media::read_image(path)
}

#[tauri::command]
pub(crate) fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<(), String> {
    services::media::import_card_image(src, dest, max_width, max_height, quality)
}

#[tauri::command]
pub(crate) fn load_strings_conf(app: AppHandle) -> Result<String, String> {
    services::media::load_strings_conf(&app)
}

#[tauri::command]
pub(crate) fn open_in_system_editor(path: String) -> Result<(), String> {
    services::media::open_in_system_editor(path)
}

#[tauri::command]
pub(crate) fn open_in_default_app(path: String) -> Result<(), String> {
    services::media::open_in_default_app(path)
}
