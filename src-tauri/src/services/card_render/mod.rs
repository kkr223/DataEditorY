mod adapter;
mod bundle;
mod dto;
mod output;
mod resources;

use tauri::AppHandle;
use ygo_card_renderer_rs::model::PositionedRenderImage;

pub(crate) use dto::{
    PrepareCardRenderResourceRequest, PreparedCardRenderResource, RenderCardPayload,
};
pub(crate) use resources::RenderResourceRegistry;

pub(crate) fn render_card(app: &AppHandle, payload: RenderCardPayload) -> Result<Vec<u8>, String> {
    bundle::ensure_renderer_bundle(app)?;

    let password_text = payload.draft.identity.password_text.clone();
    let mut request = adapter::render_request_from_draft(payload.draft)?;
    let art_image = payload
        .resources
        .art_image
        .as_ref()
        .map(|resource| resources::resolve_image_resource(app, resource))
        .transpose()?;
    let foreground_image = payload
        .resources
        .foreground_image
        .as_ref()
        .map(|resource| resources::resolve_image_resource(app, resource))
        .transpose()?;

    if let Some(art_image) = art_image.as_ref() {
        request.options.art_image = Some(art_image.path().to_path_buf());
    }
    if let Some(foreground_image) = foreground_image.as_ref() {
        request.options.foreground_image = Some(PositionedRenderImage {
            path: foreground_image.path().to_path_buf(),
            x: 0,
            y: 0,
            width: None,
            height: None,
            scale: None,
            scale_x: None,
            scale_y: None,
            rotation: None,
        });
    }

    output::render_png_with_password_override(
        &request,
        password_text
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
    )
}

pub(crate) fn prepare_image_resource(
    app: &AppHandle,
    request: PrepareCardRenderResourceRequest,
) -> Result<PreparedCardRenderResource, String> {
    resources::prepare_image_resource(app, request)
}

pub(crate) fn release_image_resource(app: &AppHandle, token: String) -> Result<(), String> {
    resources::release_image_resource(app, token)
}
