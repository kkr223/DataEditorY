use ygo_card_renderer_rs::{
    document::{ImageCrop, RenderOp},
    model::{FontWeight, ImageFit, PositionedRenderImage, TextGradient, TextPaint},
    RenderDocument, RenderRequest, Renderer,
};

use super::{
    dto::{ArtFitDto, DocumentEdit, ForegroundLayoutDto, ImageCropDto, TextFill},
    error::{RenderError, RenderResult},
};

pub(super) fn render_card_with_edits(
    request: &RenderRequest,
    edits: &[DocumentEdit],
) -> RenderResult<Vec<u8>> {
    let renderer = Renderer::new();
    let mut document = renderer.build_document(request).map_err(|err| {
        RenderError::renderer("Failed to build card render document", err.to_string())
    })?;

    apply_document_edits(&mut document, edits);

    renderer
        .render_document(&document)
        .map_err(|err| RenderError::renderer("Failed to render card document to PNG", err.to_string()))
}

pub(super) fn apply_document_edits(document: &mut RenderDocument, edits: &[DocumentEdit]) {
    for edit in edits {
        apply_document_edit(document, edit);
    }
}

fn apply_document_edit(document: &mut RenderDocument, edit: &DocumentEdit) {
    let Some(node) = document.nodes.iter_mut().find(|node| node.id == edit.node_id()) else {
        return;
    };

    match edit {
        DocumentEdit::SetText { text, .. } => match &mut node.op {
            RenderOp::TextLine { text: target, .. } | RenderOp::TextBlock { text: target, .. } => {
                *target = text.clone();
            }
            _ => {}
        },
        DocumentEdit::SetTextFill { fill, .. } => {
            let paint = text_paint(fill);
            match &mut node.op {
                RenderOp::TextLine { fill: target, .. }
                | RenderOp::TextBlock { fill: target, .. } => {
                    *target = paint;
                }
                _ => {}
            }
        }
        DocumentEdit::SetTextShadow { shadow, .. } => {
            let paint = shadow.as_ref().map(text_paint);
            match &mut node.op {
                RenderOp::TextLine { shadow: target, .. }
                | RenderOp::TextBlock { shadow: target, .. } => {
                    *target = paint;
                }
                _ => {}
            }
        }
        DocumentEdit::SetFontWeight { weight, .. } => match &mut node.op {
            RenderOp::TextLine {
                font_weight: target,
                ..
            }
            | RenderOp::TextBlock {
                font_weight: target,
                ..
            } => {
                *target = weight.map(FontWeight::Number);
            }
            _ => {}
        },
        DocumentEdit::SetFontSize { size, .. } => match &mut node.op {
            RenderOp::TextLine {
                font_size: target, ..
            }
            | RenderOp::TextBlock {
                font_size: target, ..
            } => {
                *target = (*size).max(1);
            }
            _ => {}
        },
        DocumentEdit::SetLineHeight { height, .. } => {
            if let RenderOp::TextBlock {
                line_height: target,
                ..
            } = &mut node.op
            {
                *target = finite_positive(*height, *target);
            }
        }
        DocumentEdit::SetFirstLineCompress { enabled, .. } => {
            if let RenderOp::TextBlock {
                first_line_compress,
                ..
            } = &mut node.op
            {
                *first_line_compress = *enabled;
            }
        }
        DocumentEdit::SetArtFit { fit, .. } => {
            if let RenderOp::ExternalImage { fit: target, .. } = &mut node.op {
                *target = image_fit(*fit);
            }
        }
        DocumentEdit::SetArtCrop { crop, .. } => {
            if let RenderOp::ExternalImage { crop: target, .. } = &mut node.op {
                *target = crop.map(image_crop);
            }
        }
        DocumentEdit::SetArtScale { scale, .. } => {
            if let RenderOp::ExternalImage { scale: target, .. } = &mut node.op {
                *target = finite_positive(*scale, *target);
            }
        }
        DocumentEdit::SetArtOffset {
            offset_x,
            offset_y,
            ..
        } => {
            if let RenderOp::ExternalImage {
                offset_x: target_x,
                offset_y: target_y,
                ..
            } = &mut node.op
            {
                *target_x = finite_or_default(*offset_x, *target_x);
                *target_y = finite_or_default(*offset_y, *target_y);
            }
        }
        DocumentEdit::SetForegroundLayout { layout, .. } => {
            if let RenderOp::PositionedImage { image } = &mut node.op {
                apply_foreground_layout(image, *layout);
            }
        }
        DocumentEdit::SetVisible { visible, .. } => {
            node.visible = *visible;
        }
        DocumentEdit::SetFillRect { color, opacity, .. } => {
            if let RenderOp::FillRect {
                color: target_color,
                opacity: target_opacity,
                ..
            } = &mut node.op
            {
                *target_color = color.clone();
                *target_opacity = finite_or_default(*opacity, *target_opacity).clamp(0.0, 1.0);
            }
        }
    }
}

fn text_paint(fill: &TextFill) -> TextPaint {
    TextPaint {
        color: optional_trimmed(fill.color.clone()),
        gradient: fill.gradient.as_ref().map(|gradient| {
            TextGradient::new(gradient.start.clone(), gradient.end.clone())
        }),
    }
}

fn image_fit(fit: ArtFitDto) -> ImageFit {
    match fit {
        ArtFitDto::Stretch => ImageFit::Stretch,
        ArtFitDto::Cover => ImageFit::Cover,
        ArtFitDto::Contain => ImageFit::Contain,
    }
}

fn image_crop(crop: ImageCropDto) -> ImageCrop {
    ImageCrop {
        x: finite_or_default(crop.x, 0.0),
        y: finite_or_default(crop.y, 0.0),
        width: finite_positive(crop.width, 1.0),
        height: finite_positive(crop.height, 1.0),
    }
}

fn apply_foreground_layout(image: &mut PositionedRenderImage, layout: ForegroundLayoutDto) {
    let scale = finite_positive(layout.scale, 1.0);
    let width = finite_positive(layout.width, 1.0) * scale;
    let height = finite_positive(layout.height, 1.0) * scale;

    image.x = finite_i32_or_default(layout.x, image.x);
    image.y = finite_i32_or_default(layout.y, image.y);
    image.width = Some(width);
    image.height = Some(height);
    image.scale = None;
    image.scale_x = None;
    image.scale_y = None;
    image.rotation = finite_optional(layout.rotation);
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn finite_positive(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn finite_optional(value: f32) -> Option<f32> {
    value.is_finite().then_some(value)
}

fn finite_or_default(value: f32, fallback: f32) -> f32 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

fn finite_i32_or_default(value: f32, fallback: i32) -> i32 {
    if !value.is_finite() {
        return fallback;
    }

    value.round().clamp(i32::MIN as f32, i32::MAX as f32) as i32
}
