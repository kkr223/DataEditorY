use tauri::AppHandle;

use crate::services;

#[tauri::command(async)]
pub(crate) fn read_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = services::media::read_binary_file(path)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command(async)]
pub(crate) fn read_text_file(path: String) -> Result<String, String> {
    services::media::read_text_file(path)
}

/// Writes a file from a raw IPC body framed as:
/// `[u32 little-endian path length][utf-8 path][file bytes]`.
#[tauri::command(async)]
pub(crate) fn write_binary_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err("write_binary_file expects a raw request body".to_string());
    };
    if body.len() < 4 {
        return Err("write_binary_file body is too short".to_string());
    }
    let path_length = u32::from_le_bytes(
        body[..4]
            .try_into()
            .map_err(|_| "Invalid path length".to_string())?,
    ) as usize;
    let data_start = 4_usize
        .checked_add(path_length)
        .filter(|start| *start <= body.len())
        .ok_or_else(|| "Invalid path length".to_string())?;
    let path = std::str::from_utf8(&body[4..data_start])
        .map_err(|err| format!("Invalid path encoding: {err}"))?
        .to_string();
    services::media::write_file(path, body[data_start..].to_vec())
}

#[tauri::command(async)]
pub(crate) fn path_exists(path: String) -> Result<bool, String> {
    services::media::path_exists(path)
}

#[tauri::command(async)]
pub(crate) fn resolve_resource_file(
    app: AppHandle,
    relative_path: String,
) -> Result<String, String> {
    services::media::resolve_resource_file(&app, relative_path)
}

#[tauri::command(async)]
pub(crate) fn list_image_folder_entries(path: String) -> Result<Vec<String>, String> {
    services::media::list_image_folder_entries(path)
}

#[tauri::command(async)]
pub(crate) fn read_lua_helper_scripts(
    path: String,
) -> Result<Vec<services::media::LuaHelperScript>, String> {
    services::media::read_lua_helper_scripts(path)
}

#[tauri::command(async)]
pub(crate) fn read_builtin_lua_helper_scripts() -> Vec<services::media::LuaHelperScript> {
    services::media::read_builtin_lua_helper_scripts()
}

#[tauri::command(async)]
pub(crate) fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<(), String> {
    services::media::import_card_image(src, dest, max_width, max_height, quality)
}

#[tauri::command(async)]
pub(crate) fn load_strings_conf(app: AppHandle) -> Result<String, String> {
    services::media::load_strings_conf(&app)
}

#[tauri::command(async)]
pub(crate) fn open_in_system_editor(path: String) -> Result<(), String> {
    services::media::open_in_system_editor(path)
}

#[tauri::command(async)]
pub(crate) fn open_in_default_app(path: String) -> Result<(), String> {
    services::media::open_in_default_app(path)
}

#[tauri::command(async)]
pub(crate) async fn reveal_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || services::media::reveal_file(path))
        .await
        .map_err(|error| error.to_string())?
}
