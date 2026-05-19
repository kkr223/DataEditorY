use ygo_card_renderer_rs::{
    model::{NameColor, RareType, TextGradient, YgoCardMeta},
    CardKind, RenderOptions, RenderRequest,
};
use ygopro_cdb_encode_rs::CardDataEntry;

use super::dto::{CardRenderDraft, CardRenderKind, CardRenderNameColor, CardRenderTextGradient};

pub(super) fn render_request_from_draft(draft: CardRenderDraft) -> Result<RenderRequest, String> {
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
        scale.max(0.01)
    } else {
        1.0
    }
}

fn parse_rare_type(value: &str) -> Result<Option<RareType>, String> {
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
        _ => return Err(format!("Unsupported card render rare type: {value}")),
    };

    Ok(Some(rare_type))
}

#[cfg(test)]
mod tests {
    use super::super::dto::RenderCardPayload;
    use super::*;

    #[test]
    fn deserializes_app_level_render_payload() {
        let raw = r##"{
            "draft": {
                "kind": "yugioh",
                "identity": {
                    "code": 89631139,
                    "alias": 0,
                    "ruleCode": 0,
                    "passwordText": "89631139"
                },
                "frame": {
                    "setcode": [12296],
                    "type": 17,
                    "level": 8,
                    "lscale": 0,
                    "rscale": 0,
                    "linkMarker": 0
                },
                "stats": {
                    "attack": 3000,
                    "defense": 2500,
                    "race": 8192,
                    "attribute": 16,
                    "category": 0,
                    "ot": 0
                },
                "localizedText": {
                    "name": "Blue-Eyes White Dragon",
                    "description": "A white dragon.",
                    "strings": ["first"]
                },
                "visualStyle": {
                    "rare": "ur",
                    "nameColor": { "kind": "custom", "value": "#f3cc63" },
                    "nameGradient": { "start": "#8a5d17", "end": "#f8e6a2" },
                    "twentieth": true,
                    "outFrame": true,
                    "outFrameEffectEnabled": true,
                    "outFrameEffectBackgroundColor": "#f6f2e8",
                    "outFrameEffectOpacity": 0.78
                },
                "outputOptions": {
                    "language": "en",
                    "scale": 0.43,
                    "descriptionFirstLineCompress": true
                }
            },
            "resources": {
                "artImage": {
                    "kind": "dataUrl",
                    "dataUrl": "data:image/png;base64,AAA"
                }
            }
        }"##;

        let payload: RenderCardPayload = serde_json::from_str(raw).unwrap();
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
        assert!(request.card.twentieth);
        assert!(request.card.out_frame);
        assert_eq!(request.options.language.as_deref(), Some("en"));
        assert_eq!(request.options.scale, 0.43);
        assert!(request.options.description_first_line_compress);
        assert_eq!(
            match payload.resources.art_image {
                Some(super::super::dto::CardRenderImageResource::DataUrl { data_url }) => data_url,
                _ => String::new(),
            },
            "data:image/png;base64,AAA"
        );
    }

    #[test]
    fn rejects_unknown_rare_type() {
        let result = parse_rare_type("unknown");

        assert!(result.is_err());
    }
}
