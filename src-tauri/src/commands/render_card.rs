use tauri::AppHandle;

use crate::services;

fn render_command<T>(result: services::card_render::RenderResult<T>) -> Result<T, String> {
    result.map_err(|err| err.to_string())
}

#[tauri::command]
pub(crate) async fn render_card(
    app: AppHandle,
    payload: services::card_render::RenderCardPayload,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        render_command(services::card_render::render_card(&app, payload))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub(crate) fn prepare_card_render_resource(
    app: AppHandle,
    request: services::card_render::PrepareCardRenderResourceRequest,
) -> Result<services::card_render::PreparedCardRenderResource, String> {
    render_command(services::card_render::prepare_image_resource(&app, request))
}

#[tauri::command]
pub(crate) fn release_card_render_resource(app: AppHandle, token: String) -> Result<(), String> {
    render_command(services::card_render::release_image_resource(&app, token))
}
