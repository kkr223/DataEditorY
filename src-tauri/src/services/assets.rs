use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::models::cdb::CopyCardAssetsRequest;

pub(crate) fn cdb_dir_from_path(path: &str) -> Result<PathBuf, String> {
    Path::new(path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve the database directory".to_string())
}

pub(crate) fn main_image_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("pics").join(format!("{card_id}.jpg"))
}

pub(crate) fn field_image_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir
        .join("pics")
        .join("field")
        .join(format!("{card_id}.jpg"))
}

pub(crate) fn script_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("script").join(format!("c{card_id}.lua"))
}

pub(crate) fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn copy_if_exists(src: &Path, dest: &Path) -> Result<bool, String> {
    if !src.is_file() {
        return Ok(false);
    }

    ensure_parent_dir(dest)?;
    fs::copy(src, dest).map_err(|err| err.to_string())?;
    Ok(true)
}

pub fn copy_card_assets(request: CopyCardAssetsRequest) -> Result<(), String> {
    let source_dir = cdb_dir_from_path(&request.source_cdb_path)?;
    let target_dir = cdb_dir_from_path(&request.target_cdb_path)?;

    for &card_id in &request.card_ids {
        if request.include_images {
            let _ = copy_if_exists(
                &main_image_path(&source_dir, card_id),
                &main_image_path(&target_dir, card_id),
            )?;
            let _ = copy_if_exists(
                &field_image_path(&source_dir, card_id),
                &field_image_path(&target_dir, card_id),
            )?;
        }

        if request.include_scripts {
            let _ = copy_if_exists(
                &script_path(&source_dir, card_id),
                &script_path(&target_dir, card_id),
            )?;
        }
    }

    Ok(())
}
