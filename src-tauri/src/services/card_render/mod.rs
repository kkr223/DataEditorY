mod bundle;
mod dto;
mod edit;
mod error;
mod resources;

pub(crate) use dto::{
    PrepareCardRenderResourceRequest, PreparedCardRenderResource, RenderCardPayload,
};
pub(crate) use error::RenderResult;
pub(crate) use resources::RenderResourceRegistry;

use std::path::Path;

use tauri::AppHandle;
use ygo_card_renderer_rs::{
    model::{
        EffectMask, ImageAlign, PositionedRenderImage, RareType, TextAlignChoice, YgoCardMeta,
    },
    CardKind, RenderOptions, RenderRequest,
};
use ygopro_cdb_encode_rs::CardDataEntry;

use self::{
    dto::{CardBaseData, CardRenderKind, DocumentEdit, ForegroundLayoutDto, TextAlignDto},
    error::{RenderError, RenderResult as CardRenderResult},
};

const MAX_RENDER_SCALE: f32 = 2.0;

pub(crate) fn render_card(app: &AppHandle, payload: RenderCardPayload) -> RenderResult<Vec<u8>> {
    bundle::ensure_renderer_bundle(app)?;

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
    let effect_mask = payload
        .resources
        .effect_mask
        .as_ref()
        .map(|resource| resources::resolve_image_resource(app, resource))
        .transpose()?;

    let request = build_render_request(
        &payload.base,
        &payload.edits,
        art_image.as_ref().map(|image| image.path()),
        foreground_image.as_ref().map(|image| image.path()),
        effect_mask.as_ref().map(|image| image.path()),
    )?;

    edit::render_card_with_edits(&request, &payload.edits)
}

pub(crate) fn prepare_image_resource(
    app: &AppHandle,
    request: PrepareCardRenderResourceRequest,
) -> RenderResult<PreparedCardRenderResource> {
    resources::prepare_image_resource(app, request)
}

pub(crate) fn release_image_resource(app: &AppHandle, token: String) -> RenderResult<()> {
    resources::release_image_resource(app, token)
}

fn build_render_request(
    base: &CardBaseData,
    edits: &[DocumentEdit],
    art_image: Option<&Path>,
    foreground_image: Option<&Path>,
    effect_mask: Option<&Path>,
) -> CardRenderResult<RenderRequest> {
    let entry = CardDataEntry {
        code: base.code,
        alias: base.alias,
        setcode: base.setcode.clone(),
        type_: base.type_,
        attack: base.attack,
        defense: base.defense,
        level: base.level,
        race: base.race,
        attribute: base.attribute,
        category: base.category,
        ot: base.ot,
        name: base.name.clone(),
        desc: base.desc.clone(),
        strings: base.strings.clone(),
        lscale: base.lscale,
        rscale: base.rscale,
        link_marker: base.link_marker,
        rule_code: base.rule_code,
    };

    let mut card = YgoCardMeta::from_entry(entry);
    card.rare = base
        .rare
        .as_deref()
        .map(parse_rare_type)
        .transpose()?
        .flatten();
    card.twentieth = base.twentieth;
    card.twenty_fifth = base.twenty_fifth;
    card.out_frame = base.out_frame;
    card.out_frame_effect_enabled = base.out_frame_effect_enabled;
    card.out_frame_effect_background_color =
        optional_trimmed_string(base.out_frame_effect_background_color.clone());
    card.out_frame_effect_opacity = base.out_frame_effect_opacity;
    card.package = optional_text_edit(edits, "package");
    card.copyright = optional_text_edit(edits, "copyright");
    card.laser = optional_text_edit(edits, "laser");
    card.monster_type = optional_text_edit(edits, "monster-type-line");

    let foreground_layout = foreground_layout_edit(edits);
    let foreground_image =
        foreground_image.map(|path| positioned_foreground_image(path, foreground_layout));

    Ok(RenderRequest {
        kind: card_kind(base.kind),
        card,
        options: RenderOptions {
            language: optional_trimmed_string(Some(base.language.clone())),
            art_image: art_image.map(Path::to_path_buf),
            art_align: Some(ImageAlign::Top),
            foreground_image,
            effect_mask: effect_mask.map(|path| EffectMask {
                path: path.to_path_buf(),
                x: None,
                y: None,
            }),
            scale: finite_scale_or_default(base.scale),
            font: optional_trimmed_string(base.font.clone()),
            align: base.align.map(text_align_choice),
            description_align: base.description_align.map(text_align_choice),
            radius: base.radius,
            atk_bar: base.atk_bar,
            ..RenderOptions::default()
        },
    })
}

fn card_kind(kind: CardRenderKind) -> CardKind {
    match kind {
        CardRenderKind::Yugioh => CardKind::Yugioh,
    }
}

fn text_align_choice(align: TextAlignDto) -> TextAlignChoice {
    match align {
        TextAlignDto::Left => TextAlignChoice::Left,
        TextAlignDto::Center => TextAlignChoice::Center,
        TextAlignDto::Right => TextAlignChoice::Right,
        TextAlignDto::Justify => TextAlignChoice::Justify,
    }
}

fn optional_text_edit(edits: &[DocumentEdit], node_id: &str) -> Option<String> {
    edits.iter().find_map(|edit| match edit {
        DocumentEdit::SetText {
            node_id: edit_node_id,
            text,
        } if edit_node_id == node_id => optional_trimmed_string(Some(text.clone())),
        _ => None,
    })
}

fn foreground_layout_edit(edits: &[DocumentEdit]) -> Option<ForegroundLayoutDto> {
    edits.iter().find_map(|edit| match edit {
        DocumentEdit::SetForegroundLayout { node_id, layout } if node_id == "foreground" => {
            Some(*layout)
        }
        _ => None,
    })
}

fn positioned_foreground_image(
    path: &Path,
    layout: Option<ForegroundLayoutDto>,
) -> PositionedRenderImage {
    let Some(layout) = layout else {
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

    let scale = finite_positive(layout.scale, 1.0);
    PositionedRenderImage {
        path: path.to_path_buf(),
        x: finite_i32_or_default(layout.x, 0),
        y: finite_i32_or_default(layout.y, 0),
        width: Some(finite_positive(layout.width, 1.0) * scale),
        height: Some(finite_positive(layout.height, 1.0) * scale),
        scale: None,
        scale_x: None,
        scale_y: None,
        rotation: finite_optional(layout.rotation),
    }
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

fn finite_i32_or_default(value: f32, fallback: i32) -> i32 {
    if !value.is_finite() {
        return fallback;
    }

    value.round().clamp(i32::MIN as f32, i32::MAX as f32) as i32
}

fn parse_rare_type(value: &str) -> CardRenderResult<Option<RareType>> {
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
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use image::{Rgba, RgbaImage};
    use serde::{Deserialize, Serialize};
    use ygo_card_renderer_rs::asset_bundle::{init_global_bundle_from_file, try_get_bundle};

    use super::*;

    const CARD_WIDTH: f32 = 1394.0;
    const CARD_HEIGHT: f32 = 2031.0;
    const RENDER_PNG_SNAPSHOT_PATH: &str = "../tests/fixtures/card-render-png-snapshot.json";
    const UPDATE_RENDER_PNG_SNAPSHOT_ENV: &str = "UPDATE_RENDER_PNG_SNAPSHOT";
    const SNAPSHOT_CHANNEL_TOLERANCE: u8 = 3;

    #[derive(Debug, Deserialize, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RenderPngSnapshot {
        width: u32,
        height: u32,
        samples: Vec<RenderPngPixelSample>,
    }

    #[derive(Debug, Deserialize, Serialize)]
    #[serde(rename_all = "camelCase")]
    struct RenderPngPixelSample {
        label: String,
        x: u32,
        y: u32,
        rgba: [u8; 4],
    }

    struct RenderedFixture {
        bytes: Vec<u8>,
        foreground_center_x: f32,
        foreground_center_y: f32,
        scale: f32,
    }

    fn ensure_renderer_bundle_for_test() {
        if try_get_bundle().is_ok() {
            return;
        }

        let bundle_path = renderer_bundle_path_for_test();
        assert!(
            bundle_path.is_file(),
            "renderer bundle fixture not found at {}",
            bundle_path.display()
        );

        match init_global_bundle_from_file(&bundle_path) {
            Ok(()) => {}
            Err(message) if message.contains("already initialized") => {}
            Err(message) => panic!(
                "failed to load renderer bundle at {}: {message}",
                bundle_path.display()
            ),
        }
    }

    fn renderer_bundle_path_for_test() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../ygo-card-renderer-rs/resources/yugioh_bundle.bin")
    }

    fn unique_temp_png_path(label: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dataeditory-card-render-{label}-{}-{timestamp}.png",
            std::process::id()
        ))
    }

    fn create_foreground_fixture(path: &Path) {
        RgbaImage::from_pixel(64, 64, Rgba([255, 0, 0, 220]))
            .save(path)
            .unwrap();
    }

    fn render_shared_payload_fixture() -> RenderedFixture {
        ensure_renderer_bundle_for_test();

        let raw = include_str!("../../../../tests/fixtures/card-render-payload.json");
        let payload: dto::RenderCardPayload = serde_json::from_str(raw).unwrap();
        let scale = payload.base.scale;
        let foreground_path = unique_temp_png_path("foreground");

        create_foreground_fixture(&foreground_path);
        let request = build_render_request(
            &payload.base,
            &payload.edits,
            None,
            Some(&foreground_path),
            None,
        )
        .unwrap();
        let layout = foreground_layout_edit(&payload.edits).unwrap();

        let bytes = edit::render_card_with_edits(&request, &payload.edits).unwrap();
        let _ = fs::remove_file(&foreground_path);

        RenderedFixture {
            bytes,
            foreground_center_x: layout.x + (layout.width * layout.scale) / 2.0,
            foreground_center_y: layout.y + (layout.height * layout.scale) / 2.0,
            scale,
        }
    }

    fn scaled_card_coordinate(value: f32, source_size: f32, output_size: u32) -> u32 {
        ((value / source_size) * output_size as f32)
            .round()
            .clamp(0.0, (output_size - 1) as f32) as u32
    }

    fn sample_at_card_space(
        image: &RgbaImage,
        label: &str,
        x: f32,
        y: f32,
    ) -> RenderPngPixelSample {
        let x = scaled_card_coordinate(x, CARD_WIDTH, image.width());
        let y = scaled_card_coordinate(y, CARD_HEIGHT, image.height());

        RenderPngPixelSample {
            label: label.to_string(),
            x,
            y,
            rgba: image.get_pixel(x, y).0,
        }
    }

    fn build_render_png_snapshot(
        image: &RgbaImage,
        foreground_center_x: f32,
        foreground_center_y: f32,
    ) -> RenderPngSnapshot {
        RenderPngSnapshot {
            width: image.width(),
            height: image.height(),
            samples: vec![
                sample_at_card_space(image, "upper-frame", 697.0, 130.0),
                sample_at_card_space(image, "art-window", 697.0, 640.0),
                sample_at_card_space(
                    image,
                    "foreground-center",
                    foreground_center_x,
                    foreground_center_y,
                ),
                sample_at_card_space(image, "effect-box", 350.0, 1540.0),
                sample_at_card_space(image, "lower-right-frame", 1210.0, 1890.0),
            ],
        }
    }

    fn snapshot_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(RENDER_PNG_SNAPSHOT_PATH)
    }

    fn assert_pixel_sample_matches(expected: &RenderPngPixelSample, actual: &RenderPngPixelSample) {
        assert_eq!(actual.label, expected.label);
        assert_eq!(actual.x, expected.x, "sample {} x drifted", expected.label);
        assert_eq!(actual.y, expected.y, "sample {} y drifted", expected.label);

        for channel in 0..4 {
            let delta = actual.rgba[channel].abs_diff(expected.rgba[channel]);
            assert!(
                delta <= SNAPSHOT_CHANNEL_TOLERANCE,
                "sample {} channel {channel} drifted: expected {}, got {}",
                expected.label,
                expected.rgba[channel],
                actual.rgba[channel]
            );
        }
    }

    #[test]
    fn deserializes_app_level_render_payload() {
        let raw = include_str!("../../../../tests/fixtures/card-render-payload.json");
        let payload: dto::RenderCardPayload = serde_json::from_str(raw).unwrap();
        let request = build_render_request(&payload.base, &payload.edits, None, None, None).unwrap();

        assert_eq!(request.kind, CardKind::Yugioh);
        assert_eq!(request.card.entry.code, 89631139);
        assert_eq!(request.card.entry.type_, 17);
        assert_eq!(request.card.entry.name, "Blue-Eyes White Dragon");
        assert_eq!(request.card.entry.desc, "A white dragon.");
        assert_eq!(request.card.rare, Some(RareType::Ur));
        assert_eq!(request.card.package.as_deref(), Some("LOB"));
        assert_eq!(request.card.copyright.as_deref(), Some("en"));
        assert_eq!(request.card.laser.as_deref(), Some("laser1"));
        assert!(request.card.twentieth);
        assert!(request.card.twenty_fifth);
        assert!(request.card.out_frame);
        assert_eq!(request.options.language.as_deref(), Some("en"));
        assert_eq!(request.options.scale, 0.43);
        assert_eq!(request.options.font.as_deref(), Some("custom1"));
        assert_eq!(request.options.radius, Some(true));
        assert_eq!(request.options.atk_bar, Some(true));
        assert_eq!(request.options.description_align, Some(TextAlignChoice::Center));
    }

    #[test]
    fn rejects_unknown_rare_type() {
        let result = parse_rare_type("unknown");

        assert!(result.is_err());
    }

    #[test]
    fn renders_shared_payload_fixture_to_png_smoke() {
        let rendered_fixture = render_shared_payload_fixture();

        let bytes = rendered_fixture.bytes;
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        let rendered = image::load_from_memory(&bytes).unwrap().to_rgba8();
        let expected_width = (CARD_WIDTH * rendered_fixture.scale).round() as i32;
        let expected_height = (CARD_HEIGHT * rendered_fixture.scale).round() as i32;

        assert!((rendered.width() as i32 - expected_width).abs() <= 1);
        assert!((rendered.height() as i32 - expected_height).abs() <= 1);

        let sample_x = ((rendered_fixture.foreground_center_x / CARD_WIDTH)
            * rendered.width() as f32)
            .round()
            .clamp(0.0, (rendered.width() - 1) as f32) as u32;
        let sample_y = ((rendered_fixture.foreground_center_y / CARD_HEIGHT)
            * rendered.height() as f32)
            .round()
            .clamp(0.0, (rendered.height() - 1) as f32) as u32;
        let pixel = rendered.get_pixel(sample_x, sample_y).0;

        assert!(
            pixel[0] > pixel[1].saturating_add(40) && pixel[0] > pixel[2].saturating_add(40),
            "expected foreground smoke sample to be red-dominant, got rgba({pixel:?})"
        );
    }

    #[test]
    fn render_png_matches_committed_snapshot() {
        let rendered_fixture = render_shared_payload_fixture();
        let rendered = image::load_from_memory(&rendered_fixture.bytes)
            .unwrap()
            .to_rgba8();
        let actual = build_render_png_snapshot(
            &rendered,
            rendered_fixture.foreground_center_x,
            rendered_fixture.foreground_center_y,
        );
        let snapshot_path = snapshot_path();

        if std::env::var_os(UPDATE_RENDER_PNG_SNAPSHOT_ENV).is_some() {
            let content = format!("{}\n", serde_json::to_string_pretty(&actual).unwrap());
            fs::write(&snapshot_path, content).expect("update render PNG snapshot");
        }

        let expected: RenderPngSnapshot =
            serde_json::from_str(&fs::read_to_string(&snapshot_path).unwrap())
                .expect("parse committed render PNG snapshot");

        assert_eq!(actual.width, expected.width);
        assert_eq!(actual.height, expected.height);
        assert_eq!(actual.samples.len(), expected.samples.len());

        for (actual, expected) in actual.samples.iter().zip(expected.samples.iter()) {
            assert_pixel_sample_matches(expected, actual);
        }
    }
}
