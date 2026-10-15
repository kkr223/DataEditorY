use std::{
    fs, io,
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

#[derive(Clone)]
pub(crate) struct CardAssetIdChange {
    files: Vec<(PathBuf, PathBuf)>,
    remove_original: bool,
}

fn copy_new_file(source: &Path, destination: &Path) -> Result<(), String> {
    ensure_parent_dir(destination)?;
    let mut input = fs::File::open(source).map_err(|err| err.to_string())?;
    let mut output = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|err| format!("Cannot create {}: {err}", destination.display()))?;
    if let Err(err) = io::copy(&mut input, &mut output).and_then(|_| output.sync_all()) {
        drop(output);
        let _ = fs::remove_file(destination);
        return Err(err.to_string());
    }
    Ok(())
}

impl CardAssetIdChange {
    pub(crate) fn apply(
        cdb_path: &str,
        original_id: u32,
        target_id: u32,
        remove_original: bool,
    ) -> Result<Self, String> {
        if cdb_path.trim().is_empty() {
            return Ok(Self {
                files: Vec::new(),
                remove_original,
            });
        }
        let directory = cdb_dir_from_path(cdb_path)?;
        let mut files = Vec::new();
        for folder in [directory.join("pics"), directory.join("pics").join("field")] {
            for extension in ["jpg", "jpeg", "png", "webp", "gif", "bmp"] {
                let source = folder.join(format!("{original_id}.{extension}"));
                let target = folder.join(format!("{target_id}.{extension}"));
                if source.is_file() {
                    files.push((source, target));
                }
            }
        }
        let source = script_path(&directory, original_id);
        if source.is_file() {
            files.push((source, script_path(&directory, target_id)));
        }
        // Refuse collisions before changing any files; never overwrite another card's assets.
        for (_, target) in &files {
            if target.exists() {
                return Err(format!("Card asset already exists: {}", target.display()));
            }
        }
        let change = Self {
            files,
            remove_original,
        };
        change.reapply()?;
        Ok(change)
    }

    pub(crate) fn rollback(&self) -> Result<(), String> {
        for (source, target) in &self.files {
            if self.remove_original && !source.exists() && !target.is_file() {
                return Err(format!(
                    "Cannot restore missing card asset: {}",
                    target.display()
                ));
            }
        }
        for (source, target) in self.files.iter().rev() {
            if self.remove_original && !source.exists() {
                copy_new_file(target, source)?;
            }
            if target.exists() {
                fs::remove_file(target).map_err(|err| err.to_string())?;
            }
        }
        Ok(())
    }

    pub(crate) fn reapply(&self) -> Result<(), String> {
        let mut completed = Self {
            files: Vec::new(),
            remove_original: self.remove_original,
        };
        for (source, target) in &self.files {
            if let Err(error) = copy_new_file(source, target) {
                completed.rollback()?;
                return Err(error);
            }
            completed.files.push((source.clone(), target.clone()));
            if self.remove_original {
                if let Err(error) = fs::remove_file(source) {
                    completed.rollback()?;
                    return Err(error.to_string());
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unsaved_cdb_id_changes_do_not_touch_unrelated_files() {
        for remove_original in [true, false] {
            let change = CardAssetIdChange::apply("", 100, 200, remove_original).unwrap();
            assert!(change.files.is_empty());
            change.rollback().unwrap();
            change.reapply().unwrap();
        }
    }
}
