use std::{
    collections::HashSet,
    fs, io,
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

use crate::models::cdb::CopyCardAssetsRequest;

pub(crate) const IMAGE_EXTENSIONS: [&str; 6] = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

pub(crate) fn cdb_dir_from_path(path: &str) -> Result<PathBuf, String> {
    Path::new(path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve the database directory".to_string())
}

/// Locates an existing card image with any supported extension.
pub(crate) fn find_card_image_path(cdb_dir: &Path, card_id: u32, field: bool) -> Option<PathBuf> {
    let folder = if field {
        cdb_dir.join("pics").join("field")
    } else {
        cdb_dir.join("pics")
    };
    IMAGE_EXTENSIONS
        .iter()
        .map(|extension| folder.join(format!("{card_id}.{extension}")))
        .find(|candidate| candidate.is_file())
}

pub(crate) fn script_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("script").join(format!("c{card_id}.lua"))
}

/// Collects card IDs from file names such as `123.jpg` or `c123.lua`.
pub(crate) fn scan_card_ids(dir: &Path, prefix: &str, extension: &str) -> HashSet<u32> {
    let mut ids = HashSet::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return ids;
    };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(ToOwned::to_owned) else {
            continue;
        };
        let lower = name.to_ascii_lowercase();
        let Some(stem) = lower
            .strip_suffix(&format!(".{}", extension.to_ascii_lowercase()))
            .and_then(|value| value.strip_prefix(prefix))
        else {
            continue;
        };
        if let Ok(card_id) = stem.parse::<u32>() {
            ids.insert(card_id);
        }
    }
    ids
}

pub(crate) fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn copy_if_exists(src: &Path, dest: &Path) -> Result<bool, String> {
    if !src.is_file() || dest.exists() {
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
            for field in [false, true] {
                let Some(source) = find_card_image_path(&source_dir, card_id, field) else {
                    continue;
                };
                let Some(destination) = mirrored_card_image_path(&source, &target_dir) else {
                    continue;
                };
                let _ = copy_if_exists(&source, &destination)?;
            }
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

/// Resolves where a card image should be copied inside another database directory.
pub(crate) fn mirrored_card_image_path(source: &Path, target_dir: &Path) -> Option<PathBuf> {
    let file_name = source.file_name()?;
    let field = source
        .parent()
        .and_then(Path::file_name)
        .is_some_and(|name| name == "field");
    let folder = if field {
        target_dir.join("pics").join("field")
    } else {
        target_dir.join("pics")
    };
    Some(folder.join(file_name))
}

/// Content fingerprint used to detect user edits made after an asset move.
type Fingerprint = (u64, [u8; 32]);

fn fingerprint(path: &Path) -> Option<Fingerprint> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher).ok()?;
    let len = file.metadata().ok()?.len();
    Some((len, hasher.finalize().into()))
}

#[derive(Clone)]
struct AssetMove {
    source: PathBuf,
    target: PathBuf,
    /// Fingerprint of the target immediately after it was written. A target
    /// that no longer matches was edited by the user and must not be deleted.
    fingerprint: Option<Fingerprint>,
}

#[derive(Clone)]
pub(crate) struct CardAssetIdChange {
    files: Vec<AssetMove>,
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

/// Moves a file, falling back to copy + remove across volumes.
fn move_file(source: &Path, destination: &Path) -> Result<(), String> {
    ensure_parent_dir(destination)?;
    if fs::rename(source, destination).is_ok() {
        return Ok(());
    }
    copy_new_file(source, destination)?;
    fs::remove_file(source).map_err(|err| err.to_string())
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
        let mut pending = Vec::new();
        for field in [false, true] {
            let folder = if field {
                directory.join("pics").join("field")
            } else {
                directory.join("pics")
            };
            for extension in IMAGE_EXTENSIONS {
                let source = folder.join(format!("{original_id}.{extension}"));
                if source.is_file() {
                    pending.push(AssetMove {
                        source,
                        target: folder.join(format!("{target_id}.{extension}")),
                        fingerprint: None,
                    });
                }
            }
        }
        let source = script_path(&directory, original_id);
        if source.is_file() {
            pending.push(AssetMove {
                source,
                target: script_path(&directory, target_id),
                fingerprint: None,
            });
        }
        // Refuse collisions before changing any files; never overwrite another card's assets.
        for file in &pending {
            if file.target.exists() {
                return Err(format!(
                    "Card asset already exists: {}",
                    file.target.display()
                ));
            }
        }
        let change = Self {
            files: pending,
            remove_original,
        };
        let applied = change.write_files()?;
        Ok(Self {
            files: applied,
            remove_original,
        })
    }

    pub(crate) fn rollback(&self) -> Result<(), String> {
        for (source, target) in self.files.iter().map(|file| (&file.source, &file.target)) {
            if self.remove_original && !source.exists() && !target.is_file() {
                return Err(format!(
                    "Cannot restore missing card asset: {}",
                    target.display()
                ));
            }
        }
        for file in self.files.iter().rev() {
            let (source, target) = (file.source.as_path(), file.target.as_path());
            if !target.is_file() {
                continue;
            }
            let externally_modified = file
                .fingerprint
                .is_some_and(|expected| fingerprint(target) != Some(expected));
            if self.remove_original {
                if source.exists() {
                    // A previous rollback already restored the source.
                    continue;
                }
                if externally_modified {
                    // Keep the user's edited copy under the new ID and restore
                    // the old card asset from it instead of deleting the edits.
                    copy_new_file(target, source)?;
                    continue;
                }
                move_file(target, source)?;
            } else if !externally_modified {
                fs::remove_file(target).map_err(|err| err.to_string())?;
            }
        }
        Ok(())
    }

    pub(crate) fn reapply(&self) -> Result<(), String> {
        self.write_files().map(|_| ())
    }

    /// Applies every pending move and records target fingerprints. Files that
    /// were written before a failure are undone so the change stays atomic.
    fn write_files(&self) -> Result<Vec<AssetMove>, String> {
        let mut completed: Vec<AssetMove> = Vec::new();
        for file in &self.files {
            let outcome = if self.remove_original {
                move_file(&file.source, &file.target)
            } else {
                copy_new_file(&file.source, &file.target)
            };
            if let Err(error) = outcome {
                for done in completed.iter().rev() {
                    let _ = fs::remove_file(&done.target);
                    if self.remove_original {
                        let _ = move_file(&done.target, &done.source);
                    }
                }
                return Err(error);
            }
            completed.push(AssetMove {
                source: file.source.clone(),
                target: file.target.clone(),
                fingerprint: fingerprint(&file.target),
            });
        }
        Ok(completed)
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
