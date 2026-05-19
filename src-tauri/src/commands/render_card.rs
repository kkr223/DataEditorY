use tauri::AppHandle;

use crate::services;

#[tauri::command]
pub(crate) fn render_card(
    app: AppHandle,
    payload: services::card_render::RenderCardPayload,
) -> Result<Vec<u8>, String> {
    services::card_render::render_card(&app, payload)
}

#[tauri::command]
pub(crate) fn prepare_card_render_resource(
    app: AppHandle,
    request: services::card_render::PrepareCardRenderResourceRequest,
) -> Result<services::card_render::PreparedCardRenderResource, String> {
    services::card_render::prepare_image_resource(&app, request)
}

#[tauri::command]
pub(crate) fn release_card_render_resource(app: AppHandle, token: String) -> Result<(), String> {
    services::card_render::release_image_resource(&app, token)
}
