use crate::{services, CardScriptDocument, CardScriptInfo};

#[tauri::command]
pub(crate) fn get_card_script_info(
    cdb_path: String,
    card_id: u32,
) -> Result<CardScriptInfo, String> {
    services::scripts::get_card_script_info(cdb_path, card_id)
}

#[tauri::command]
pub(crate) fn read_card_script(
    cdb_path: String,
    card_id: u32,
) -> Result<CardScriptDocument, String> {
    services::scripts::read_card_script(cdb_path, card_id)
}

#[tauri::command]
pub(crate) fn write_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
    overwrite: bool,
) -> Result<CardScriptInfo, String> {
    services::scripts::write_card_script(cdb_path, card_id, content, overwrite)
}

#[tauri::command]
pub(crate) fn save_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
) -> Result<CardScriptInfo, String> {
    services::scripts::save_card_script(cdb_path, card_id, content)
}
