use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};
use ygo_card_renderer_rs::asset_bundle::{init_global_bundle_from_file, try_get_bundle};

use super::error::{RenderError, RenderResult};

const BUNDLE_FILE_NAME: &str = "yugioh_bundle.bin";

pub(super) fn ensure_renderer_bundle(app: &AppHandle) -> RenderResult<()> {
    if try_get_bundle().is_ok() {
        return Ok(());
    }

    let bundle_path = renderer_bundle_candidates(app)
        .into_iter()
        .find(|path| path.is_file())
        .ok_or(RenderError::BundleMissing)?;

    match init_global_bundle_from_file(&bundle_path) {
        Ok(()) => Ok(()),
        Err(message) if message.contains("already initialized") => Ok(()),
        Err(message) => Err(RenderError::bundle_load(bundle_path, message)),
    }
}

fn renderer_bundle_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join(BUNDLE_FILE_NAME));
        candidates.push(resource_dir.join(BUNDLE_FILE_NAME));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    candidates.push(manifest_dir.join("resources").join(BUNDLE_FILE_NAME));

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("resources").join(BUNDLE_FILE_NAME));
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
