use tauri::AppHandle;

#[cfg(feature = "card-render")]
use crate::services;

#[cfg(feature = "card-render")]
fn render_command<T>(result: services::card_render::RenderResult<T>) -> Result<T, String> {
    result.map_err(|err| err.to_string())
}

#[cfg(feature = "card-render")]
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

#[cfg(feature = "card-render")]
#[tauri::command]
pub(crate) fn prepare_card_render_resource(
    app: AppHandle,
    request: services::card_render::PrepareCardRenderResourceRequest,
) -> Result<services::card_render::PreparedCardRenderResource, String> {
    render_command(services::card_render::prepare_image_resource(&app, request))
}

#[cfg(feature = "card-render")]
#[tauri::command]
pub(crate) fn release_card_render_resource(app: AppHandle, token: String) -> Result<(), String> {
    render_command(services::card_render::release_image_resource(&app, token))
}

#[cfg(not(feature = "card-render"))]
#[tauri::command]
pub(crate) async fn render_card(
    _app: AppHandle,
    _payload: serde_json::Value,
) -> Result<Vec<u8>, String> {
    Err("Card rendering is not available in this build.".to_string())
}

#[cfg(not(feature = "card-render"))]
#[tauri::command]
pub(crate) fn prepare_card_render_resource(
    _app: AppHandle,
    _request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Err("Card rendering is not available in this build.".to_string())
}

#[cfg(not(feature = "card-render"))]
#[tauri::command]
pub(crate) fn release_card_render_resource(_app: AppHandle, _token: String) -> Result<(), String> {
    Ok(())
}
