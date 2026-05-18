use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use base64::{engine::general_purpose, Engine as _};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use ygo_card_renderer_rs::{
    asset_bundle::{init_global_bundle_from_file, try_get_bundle},
    document::RenderOp,
    model::PositionedRenderImage,
    RenderRequest, Renderer,
};

const BUNDLE_FILE_NAME: &str = "yugioh_bundle.bin";
const MAX_DATA_URL_BYTES: usize = 16 * 1024 * 1024;

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderCardPayload {
    pub request: RenderRequest,
    #[serde(default)]
    pub art_image_data_url: Option<String>,
    #[serde(default)]
    pub foreground_image_data_url: Option<String>,
    #[serde(default)]
    pub password_text: Option<String>,
}

struct TempRenderFile {
    path: PathBuf,
}

impl TempRenderFile {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempRenderFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub(crate) fn render_card(app: &AppHandle, payload: RenderCardPayload) -> Result<Vec<u8>, String> {
    ensure_renderer_bundle(app)?;

    let mut request = payload.request;
    let art_image = payload
        .art_image_data_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(write_data_url_to_temp_file)
        .transpose()?;
    let foreground_image = payload
        .foreground_image_data_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(write_data_url_to_temp_file)
        .transpose()?;

    if let Some(art_image) = art_image.as_ref() {
        request.options.art_image = Some(art_image.path().to_path_buf());
    }
    if let Some(foreground_image) = foreground_image.as_ref() {
        request.options.foreground_image = Some(PositionedRenderImage {
            path: foreground_image.path().to_path_buf(),
            x: 0,
            y: 0,
        });
    }

    let renderer = Renderer::new();
    if let Some(password_text) = payload
        .password_text
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let mut document = renderer
            .build_document(&request)
            .map_err(|err| err.to_string())?;
        override_password_text(&mut document, password_text);
        return renderer
            .render_document(&document)
            .map_err(|err| err.to_string());
    }

    renderer.render_png(&request).map_err(|err| err.to_string())
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

fn ensure_renderer_bundle(app: &AppHandle) -> Result<(), String> {
    if try_get_bundle().is_ok() {
        return Ok(());
    }

    let bundle_path = renderer_bundle_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| "Unable to locate yugioh renderer bundle".to_string())?;

    match init_global_bundle_from_file(&bundle_path) {
        Ok(()) => Ok(()),
        Err(message) if message.contains("already initialized") => Ok(()),
        Err(message) => Err(format!(
            "Failed to load yugioh renderer bundle at {}: {message}",
            bundle_path.display()
        )),
    }
}

fn renderer_bundle_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join(BUNDLE_FILE_NAME));
        candidates.push(resource_dir.join(BUNDLE_FILE_NAME));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(
        manifest_dir
            .join("../../ygo-card-renderer-rs/resources")
            .join(BUNDLE_FILE_NAME),
    );
    candidates.push(manifest_dir.join("resources").join(BUNDLE_FILE_NAME));

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("resources").join(BUNDLE_FILE_NAME));
        candidates.push(
            current_dir
                .join("../ygo-card-renderer-rs/resources")
                .join(BUNDLE_FILE_NAME),
        );
    }

    dedupe_candidate_paths(candidates)
}

fn dedupe_candidate_paths(candidates: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut deduped = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for candidate in candidates {
        let resolved = fs::canonicalize(&candidate).unwrap_or_else(|_| candidate.clone());
        if seen.insert(resolved) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn write_data_url_to_temp_file(data_url: &str) -> Result<TempRenderFile, String> {
    let (mime, encoded) = parse_base64_data_url(data_url)?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Failed to decode card image data URL: {err}"))?;

    if bytes.len() > MAX_DATA_URL_BYTES {
        return Err("Card image data URL is too large".to_string());
    }

    let extension = data_url_extension(mime);
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "dataeditory-card-render-{}-{counter}.{extension}",
        std::process::id()
    ));

    fs::write(&path, bytes).map_err(|err| err.to_string())?;
    Ok(TempRenderFile::new(path))
}

fn parse_base64_data_url(data_url: &str) -> Result<(&str, &str), String> {
    let Some((header, body)) = data_url.split_once(',') else {
        return Err("Card image must be a data URL".to_string());
    };
    let Some(mime) = header.strip_prefix("data:") else {
        return Err("Card image must be a data URL".to_string());
    };
    let Some(mime) = mime.strip_suffix(";base64") else {
        return Err("Card image data URL must be base64-encoded".to_string());
    };

    Ok((mime, body))
}

fn data_url_extension(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}
