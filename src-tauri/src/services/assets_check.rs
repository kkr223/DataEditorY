use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetCheckRequest {
    pub cdb_path: String,
    pub card_ids: Vec<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetCheckMissingItem {
    pub card_id: u32,
    pub image_missing: bool,
    pub script_missing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetCheckResponse {
    pub checked: usize,
    pub missing_images: usize,
    pub missing_scripts: usize,
    pub missing: Vec<AssetCheckMissingItem>,
}

fn cdb_parent(cdb_path: &str) -> Result<PathBuf, String> {
    Path::new(cdb_path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve the database directory".to_string())
}

fn image_exists(root: &Path, card_id: u32) -> bool {
    ["jpg", "jpeg", "png", "webp", "bmp"]
        .iter()
        .any(|ext| root.join("pics").join(format!("{card_id}.{ext}")).exists())
}

fn script_exists(root: &Path, card_id: u32) -> bool {
    root.join("script").join(format!("c{card_id}.lua")).exists()
}

pub(crate) fn check_assets(request: AssetCheckRequest) -> Result<AssetCheckResponse, String> {
    let root = cdb_parent(&request.cdb_path)?;
    let checked = request.card_ids.len();
    let mut missing = Vec::new();
    let mut missing_images = 0;
    let mut missing_scripts = 0;

    for card_id in request.card_ids {
        let image_missing = !image_exists(&root, card_id);
        let script_missing = !script_exists(&root, card_id);
        if image_missing {
            missing_images += 1;
        }
        if script_missing {
            missing_scripts += 1;
        }
        if image_missing || script_missing {
            missing.push(AssetCheckMissingItem {
                card_id,
                image_missing,
                script_missing,
            });
        }
    }

    Ok(AssetCheckResponse {
        checked,
        missing_images,
        missing_scripts,
        missing,
    })
}
