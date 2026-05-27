use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::services;

fn media_command<T>(result: services::media::MediaResult<T>) -> Result<T, String> {
    result.map_err(|err| err.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectedTextFileContent {
    path: String,
    content: String,
}

#[tauri::command]
pub(crate) fn pick_card_image_config(
    app: AppHandle,
) -> Result<Option<SelectedTextFileContent>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let Some(path) = file_path.as_path() else {
        return Err("Selected file path is invalid".to_string());
    };
    let content = media_command(services::media::read_card_image_config_file(path))?;
    Ok(Some(SelectedTextFileContent {
        path: path.to_string_lossy().to_string(),
        content,
    }))
}

#[tauri::command]
pub(crate) fn pick_deck_text(app: AppHandle) -> Result<Option<SelectedTextFileContent>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("YDK / Text", &["ydk", "txt"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let Some(path) = file_path.as_path() else {
        return Err("Selected file path is invalid".to_string());
    };
    let content = media_command(services::media::read_deck_text_file(path))?;
    Ok(Some(SelectedTextFileContent {
        path: path.to_string_lossy().to_string(),
        content,
    }))
}

#[tauri::command]
pub(crate) fn read_external_text_file(path: String) -> Result<String, String> {
    media_command(services::media::read_external_text_file(path))
}

#[tauri::command]
pub(crate) fn save_external_text_file(path: String, content: String) -> Result<(), String> {
    media_command(services::media::write_external_text_file(path, content))
}

#[tauri::command]
pub(crate) fn save_card_image_config(
    app: AppHandle,
    default_file_name: String,
    content: String,
) -> Result<Option<String>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(default_file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let Some(path) = file_path.as_path() else {
        return Err("Selected file path is invalid".to_string());
    };
    media_command(services::media::write_json_file(path, content))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn save_png_file(
    app: AppHandle,
    default_file_name: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    let Some(file_path) = app
        .dialog()
        .file()
        .add_filter("PNG", &["png"])
        .set_file_name(default_file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let Some(path) = file_path.as_path() else {
        return Err("Selected file path is invalid".to_string());
    };
    media_command(services::media::write_png_file(path, data))?;
    Ok(Some(path.to_string_lossy().to_string()))
}

#[tauri::command]
pub(crate) fn save_card_image_jpg(
    cdb_path: String,
    card_code: u32,
    image_data: Vec<u8>,
    field_image_data: Option<Vec<u8>>,
) -> Result<(), String> {
    media_command(services::media::save_card_image_jpg_assets(
        cdb_path,
        card_code,
        image_data,
        field_image_data,
    ))
}

#[tauri::command]
pub(crate) fn save_script_image(
    cdb_path: String,
    card_code: u32,
    data: Vec<u8>,
) -> Result<String, String> {
    media_command(services::media::save_script_image(
        cdb_path, card_code, data,
    ))
}

#[tauri::command]
pub(crate) fn path_exists(path: String) -> Result<bool, String> {
    media_command(services::media::path_exists(path))
}

#[tauri::command]
pub(crate) fn list_image_folder_entries(path: String) -> Result<Vec<String>, String> {
    media_command(services::media::list_image_folder_entries(path))
}

#[tauri::command]
pub(crate) fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<(), String> {
    media_command(services::media::import_card_image(
        src, dest, max_width, max_height, quality,
    ))
}

#[tauri::command]
pub(crate) fn load_strings_conf(app: AppHandle) -> Result<String, String> {
    media_command(services::media::load_strings_conf(&app))
}

#[tauri::command]
pub(crate) fn load_lua_intel_resource(app: AppHandle, filename: String) -> Result<String, String> {
    media_command(services::media::load_lua_intel_resource(&app, filename))
}

#[tauri::command]
pub(crate) fn open_in_system_editor(path: String) -> Result<(), String> {
    media_command(services::media::open_in_system_editor(path))
}

#[tauri::command]
pub(crate) fn open_in_default_app(path: String) -> Result<(), String> {
    media_command(services::media::open_in_default_app(path))
}
