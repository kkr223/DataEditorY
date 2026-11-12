use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use super::assets::{scan_card_ids, IMAGE_EXTENSIONS};

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

fn image_ids(root: &Path) -> HashSet<u32> {
    let pics = root.join("pics");
    let mut ids = HashSet::new();
    for extension in IMAGE_EXTENSIONS {
        ids.extend(scan_card_ids(&pics, "", extension));
    }
    ids
}

pub(crate) fn check_assets(request: AssetCheckRequest) -> Result<AssetCheckResponse, String> {
    let root = cdb_parent(&request.cdb_path)?;
    let checked = request.card_ids.len();
    // One directory scan beats up to six `exists()` syscalls per card.
    let images = image_ids(&root);
    let scripts = scan_card_ids(&root.join("script"), "c", "lua");
    let mut missing = Vec::new();
    let mut missing_images = 0;
    let mut missing_scripts = 0;

    for card_id in request.card_ids {
        let image_missing = !images.contains(&card_id);
        let script_missing = !scripts.contains(&card_id);
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
