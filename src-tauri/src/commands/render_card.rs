use tauri::AppHandle;

use crate::services;

#[tauri::command]
pub(crate) fn render_card(
    app: AppHandle,
    payload: services::card_render::RenderCardPayload,
) -> Result<Vec<u8>, String> {
    services::card_render::render_card(&app, payload)
}
