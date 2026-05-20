mod adapter;
mod bundle;
mod dto;
mod error;
mod output;
mod resources;

pub(crate) use dto::{
    PrepareCardRenderResourceRequest, PreparedCardRenderResource, RenderCardPayload,
};
pub(crate) use error::RenderResult;
pub(crate) use resources::RenderResourceRegistry;
use tauri::AppHandle;

pub(crate) fn render_card(app: &AppHandle, payload: RenderCardPayload) -> RenderResult<Vec<u8>> {
    bundle::ensure_renderer_bundle(app)?;

    let password_text = payload.draft.identity.password_text.clone();
    let foreground_layer = payload.draft.foreground_layer;
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
        request.options.foreground_image = Some(adapter::positioned_foreground_image(
            foreground_image.path(),
            foreground_layer,
        ));
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
) -> RenderResult<PreparedCardRenderResource> {
    resources::prepare_image_resource(app, request)
}

pub(crate) fn release_image_resource(app: &AppHandle, token: String) -> RenderResult<()> {
    resources::release_image_resource(app, token)
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
        foreground_layer: dto::CardRenderForegroundLayer,
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
        let password_text = payload.draft.identity.password_text.clone();
        let foreground_layer = payload.draft.foreground_layer.unwrap();
        let mut request = adapter::render_request_from_draft(payload.draft).unwrap();
        let scale = request.options.scale;
        let foreground_path = unique_temp_png_path("foreground");

        create_foreground_fixture(&foreground_path);
        request.options.foreground_image = Some(adapter::positioned_foreground_image(
            &foreground_path,
            Some(foreground_layer),
        ));

        let bytes = output::render_png_with_password_override(
            &request,
            password_text
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
        )
        .unwrap();
        let _ = fs::remove_file(&foreground_path);

        RenderedFixture {
            bytes,
            foreground_layer,
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
        foreground_layer: dto::CardRenderForegroundLayer,
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
                    foreground_layer.center_x,
                    foreground_layer.center_y,
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
    fn renders_shared_payload_fixture_to_png_smoke() {
        let rendered_fixture = render_shared_payload_fixture();

        let bytes = rendered_fixture.bytes;
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        let rendered = image::load_from_memory(&bytes).unwrap().to_rgba8();
        let expected_width = (CARD_WIDTH * rendered_fixture.scale).round() as i32;
        let expected_height = (CARD_HEIGHT * rendered_fixture.scale).round() as i32;

        assert!((rendered.width() as i32 - expected_width).abs() <= 1);
        assert!((rendered.height() as i32 - expected_height).abs() <= 1);

        let layer = rendered_fixture.foreground_layer;
        let sample_x = ((layer.center_x / CARD_WIDTH) * rendered.width() as f32)
            .round()
            .clamp(0.0, (rendered.width() - 1) as f32) as u32;
        let sample_y = ((layer.center_y / CARD_HEIGHT) * rendered.height() as f32)
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
        let actual = build_render_png_snapshot(&rendered, rendered_fixture.foreground_layer);
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
