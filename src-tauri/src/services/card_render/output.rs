use ygo_card_renderer_rs::{document::RenderOp, RenderRequest, Renderer};

use super::error::{RenderError, RenderResult};

pub(super) fn render_png_with_password_override(
    request: &RenderRequest,
    password_text: Option<&str>,
) -> RenderResult<Vec<u8>> {
    let renderer = Renderer::new();

    if let Some(password_text) = password_text {
        let mut document = renderer.build_document(request).map_err(|err| {
            RenderError::renderer("Failed to build card render document", err.to_string())
        })?;
        override_password_text(&mut document, password_text);
        return renderer.render_document(&document).map_err(|err| {
            RenderError::renderer("Failed to render card document to PNG", err.to_string())
        });
    }

    renderer
        .render_png(request)
        .map_err(|err| RenderError::renderer("Failed to render card to PNG", err.to_string()))
}

fn override_password_text(
    document: &mut ygo_card_renderer_rs::RenderDocument,
    password_text: &str,
) {
    for node in &mut document.nodes {
        if node.id != "password" {
            continue;
        }
        if let RenderOp::TextLine { text, .. } = &mut node.op {
            *text = password_text.to_string();
        }
    }
}
