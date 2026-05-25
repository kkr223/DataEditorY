use std::path::Path;

use ygo_card_renderer_rs::{
    model::{NameColor, PositionedRenderImage, RareType, TextGradient, YgoCardMeta},
    CardKind, RenderOptions, RenderRequest,
};
use ygopro_cdb_encode_rs::CardDataEntry;

use super::dto::{
    CardRenderDraft, CardRenderForegroundLayer, CardRenderKind, CardRenderNameColor,
    CardRenderTextGradient,
};
use super::error::{RenderError, RenderResult};

const MAX_RENDER_SCALE: f32 = 2.0;

pub(super) fn render_request_from_draft(draft: CardRenderDraft) -> RenderResult<RenderRequest> {
    let card_kind = match draft.kind {
        CardRenderKind::Yugioh => CardKind::Yugioh,
    };
    let entry = CardDataEntry {
        code: draft.identity.code,
        alias: draft.identity.alias,
        setcode: draft.frame.setcode,
        type_: draft.frame.type_,
        attack: draft.stats.attack,
        defense: draft.stats.defense,
        level: draft.frame.level,
        race: draft.stats.race,
        attribute: draft.stats.attribute,
        category: draft.stats.category,
        ot: draft.stats.ot,
        name: draft.localized_text.name,
        desc: draft.localized_text.description,
        strings: draft.localized_text.strings,
        lscale: draft.frame.lscale,
        rscale: draft.frame.rscale,
        link_marker: draft.frame.link_marker,
        rule_code: draft.identity.rule_code,
    };

    let visual_style = draft.visual_style;
    let mut card = YgoCardMeta::from_entry(entry);
    card.rare = visual_style
        .rare
        .as_deref()
        .map(parse_rare_type)
        .transpose()?
        .flatten();
    card.name_color = convert_name_color(visual_style.name_color);
    card.name_gradient = visual_style.name_gradient.map(convert_text_gradient);
    card.name_shadow_color = optional_trimmed_string(visual_style.name_shadow_color);
    card.name_shadow_gradient = visual_style.name_shadow_gradient.map(convert_text_gradient);
    card.package = optional_trimmed_string(visual_style.package);
    card.copyright = optional_trimmed_string(visual_style.copyright);
    card.laser = optional_trimmed_string(visual_style.laser);
    card.twentieth = visual_style.twentieth;
    card.out_frame = visual_style.out_frame;
    card.out_frame_effect_enabled = visual_style.out_frame_effect_enabled;
    card.out_frame_effect_background_color =
        optional_trimmed_string(visual_style.out_frame_effect_background_color);
    card.out_frame_effect_opacity = visual_style.out_frame_effect_opacity;

    Ok(RenderRequest {
        kind: card_kind,
        card,
        options: RenderOptions {
            language: optional_trimmed_string(Some(draft.output_options.language)),
            scale: finite_scale_or_default(draft.output_options.scale),
            description_first_line_compress: draft.output_options.description_first_line_compress,
            ..RenderOptions::default()
        },
    })
}

pub(super) fn positioned_foreground_image(
    path: &Path,
    layer: Option<CardRenderForegroundLayer>,
) -> PositionedRenderImage {
    let Some(layer) = layer else {
        return PositionedRenderImage {
            path: path.to_path_buf(),
            x: 0,
            y: 0,
            width: None,
            height: None,
            scale: None,
            scale_x: None,
            scale_y: None,
            rotation: None,
        };
    };

    let width = finite_positive(layer.width * layer.scale);
    let height = finite_positive(layer.height * layer.scale);
    let x = width
        .map(|width| layer.center_x - width / 2.0)
        .unwrap_or(layer.center_x);
    let y = height
        .map(|height| layer.center_y - height / 2.0)
        .unwrap_or(layer.center_y);

    PositionedRenderImage {
        path: path.to_path_buf(),
        x: finite_i32_or_default(x, 0),
        y: finite_i32_or_default(y, 0),
        width,
        height,
        scale: None,
        scale_x: None,
        scale_y: None,
        rotation: finite_optional(layer.rotation),
    }
}

fn convert_name_color(name_color: CardRenderNameColor) -> NameColor {
    match name_color {
        CardRenderNameColor::Auto => NameColor::Auto,
        CardRenderNameColor::Custom(value) => NameColor::Custom(value),
    }
}

fn convert_text_gradient(gradient: CardRenderTextGradient) -> TextGradient {
    TextGradient::new(gradient.start, gradient.end)
}

fn optional_trimmed_string(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn finite_scale_or_default(scale: f32) -> f32 {
    if scale.is_finite() {
        scale.clamp(0.01, MAX_RENDER_SCALE)
    } else {
        1.0
    }
}

fn finite_positive(value: f32) -> Option<f32> {
    value
        .is_finite()
        .then_some(value)
        .filter(|value| *value > 0.0)
}

fn finite_optional(value: f32) -> Option<f32> {
    value.is_finite().then_some(value)
}

fn finite_i32_or_default(value: f32, fallback: i32) -> i32 {
    if !value.is_finite() {
        return fallback;
    }

    value.round().clamp(i32::MIN as f32, i32::MAX as f32) as i32
}

fn parse_rare_type(value: &str) -> RenderResult<Option<RareType>> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Ok(None);
    }

    let rare_type = match normalized.as_str() {
        "sr" => RareType::Sr,
        "hr" => RareType::Hr,
        "gr" => RareType::Gr,
        "ur" => RareType::Ur,
        "utr" => RareType::Utr,
        "ser" => RareType::Ser,
        "gser" => RareType::Gser,
        "pser" => RareType::Pser,
        "pser-print" | "pser_print" => RareType::PserPrint,
        "scr" => RareType::Scr,
        "esr" => RareType::Esr,
        "npr" => RareType::Npr,
        "upr" => RareType::Upr,
        "sepr" => RareType::Sepr,
        "dt" => RareType::Dt,
        _ => {
            return Err(RenderError::invalid(format!(
                "Unsupported card render rare type: {value}"
            )))
        }
    };

    Ok(Some(rare_type))
}

#[cfg(test)]
mod tests {
    use super::super::dto::RenderCardPayload;
    use super::*;

    #[test]
    fn deserializes_app_level_render_payload() {
        let raw = include_str!("../../../../tests/fixtures/card-render-payload.json");
        let payload: RenderCardPayload = serde_json::from_str(raw).unwrap();
        let foreground_layer = payload.draft.foreground_layer;
        let request = render_request_from_draft(payload.draft).unwrap();

        assert_eq!(request.kind, CardKind::Yugioh);
        assert_eq!(request.card.entry.code, 89631139);
        assert_eq!(request.card.entry.type_, 17);
        assert_eq!(request.card.entry.name, "Blue-Eyes White Dragon");
        assert_eq!(request.card.entry.desc, "A white dragon.");
        assert_eq!(request.card.rare, Some(RareType::Ur));
        assert_eq!(
            request.card.name_color,
            NameColor::Custom("#f3cc63".to_string())
        );
        assert!(request.card.name_gradient.is_some());
        assert_eq!(request.card.package.as_deref(), Some("LOB"));
        assert_eq!(request.card.copyright.as_deref(), Some("en"));
        assert_eq!(request.card.laser.as_deref(), Some("laser1"));
        assert!(request.card.twentieth);
        assert!(request.card.out_frame);
        assert_eq!(request.options.language.as_deref(), Some("en"));
        assert_eq!(request.options.scale, 0.43);
        assert!(request.options.description_first_line_compress);
        let foreground = positioned_foreground_image(Path::new("foreground.png"), foreground_layer);
        assert_eq!(foreground.x, 572);
        assert_eq!(foreground.y, 916);
        assert_eq!(foreground.width, Some(250.0));
        assert_eq!(foreground.height, Some(200.0));
        assert_eq!(foreground.rotation, Some(15.0));
        assert_eq!(
            match payload.resources.art_image {
                Some(super::super::dto::CardRenderImageResource::DataUrl { data_url }) => data_url,
                _ => String::new(),
            },
            "data:image/png;base64,AAA"
        );
        assert_eq!(
            match payload.resources.foreground_image {
                Some(super::super::dto::CardRenderImageResource::DataUrl { data_url }) => data_url,
                _ => String::new(),
            },
            "data:image/png;base64,BBB"
        );
    }

    #[test]
    fn rejects_unknown_rare_type() {
        let result = parse_rare_type("unknown");

        assert!(result.is_err());
    }
}
