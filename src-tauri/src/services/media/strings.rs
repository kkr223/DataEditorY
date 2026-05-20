use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use super::error::{MediaError, MediaResult};

const STRINGS_DIR_NAME: &str = "strings";
const LEGACY_STRINGS_FILE_NAME: &str = "strings.conf";
const MAX_STRINGS_TEXT_FILE_BYTES: u64 = 512 * 1024;

fn strings_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join(STRINGS_DIR_NAME));
        candidates.push(resource_dir.join(STRINGS_DIR_NAME));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(STRINGS_DIR_NAME));
        candidates.push(current_dir.join("static").join(STRINGS_DIR_NAME));
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join(STRINGS_DIR_NAME),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(STRINGS_DIR_NAME));
            candidates.push(exe_dir.join("resources").join(STRINGS_DIR_NAME));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join(STRINGS_DIR_NAME));
                candidates.push(parent.join("resources").join(STRINGS_DIR_NAME));
            }
        }
    }

    dedupe_candidate_paths(candidates)
}

fn legacy_strings_file_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join("resources")
                .join(LEGACY_STRINGS_FILE_NAME),
        );
        candidates.push(resource_dir.join(LEGACY_STRINGS_FILE_NAME));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(LEGACY_STRINGS_FILE_NAME));
        candidates.push(current_dir.join("static").join(LEGACY_STRINGS_FILE_NAME));
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join(LEGACY_STRINGS_FILE_NAME),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(LEGACY_STRINGS_FILE_NAME));
            candidates.push(exe_dir.join("resources").join(LEGACY_STRINGS_FILE_NAME));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join(LEGACY_STRINGS_FILE_NAME));
                candidates.push(parent.join("resources").join(LEGACY_STRINGS_FILE_NAME));
            }
        }
    }

    dedupe_candidate_paths(candidates)
}

fn dedupe_candidate_paths(candidates: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for candidate in candidates {
        let resolved = fs::canonicalize(&candidate).unwrap_or_else(|_| candidate.clone());
        if seen.insert(resolved) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn read_strings_text_file(path: &Path) -> MediaResult<String> {
    let metadata = fs::metadata(path)
        .map_err(|err| MediaError::io_at("Failed to read strings file metadata", path, err))?;
    if !metadata.is_file() {
        return Err(MediaError::invalid("Path is not a regular file"));
    }
    if metadata.len() > MAX_STRINGS_TEXT_FILE_BYTES {
        return Err(MediaError::invalid(format!(
            "File exceeds the {} byte safety limit",
            MAX_STRINGS_TEXT_FILE_BYTES
        )));
    }

    let bytes = fs::read(path)
        .map_err(|err| MediaError::io_at("Failed to read strings file", path, err))?;
    if bytes.contains(&0) {
        return Err(MediaError::invalid("Binary-looking file detected"));
    }

    let text = String::from_utf8(bytes)
        .map_err(|err| MediaError::utf8_at("Failed to decode strings file", path, err))?;
    Ok(text.replace("\r\n", "\n"))
}

fn read_strings_directory(dir: &Path) -> MediaResult<Vec<String>> {
    let metadata = fs::metadata(dir)
        .map_err(|err| MediaError::io_at("Failed to read strings directory metadata", dir, err))?;
    if !metadata.is_dir() {
        return Err(MediaError::invalid("Path is not a directory"));
    }

    let canonical_dir = fs::canonicalize(dir)
        .map_err(|err| MediaError::io_at("Failed to resolve strings directory", dir, err))?;
    let mut entries = fs::read_dir(&canonical_dir)
        .map_err(|err| MediaError::io_at("Failed to read strings directory", dir, err))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        a.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .cmp(
                &b.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default(),
            )
    });

    let mut contents = Vec::new();
    for path in entries {
        let Ok(canonical_path) = fs::canonicalize(&path) else {
            continue;
        };
        if !canonical_path.starts_with(&canonical_dir) {
            continue;
        }
        let Ok(file_type) = fs::metadata(&canonical_path).map(|metadata| metadata.file_type())
        else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }

        if let Ok(content) = read_strings_text_file(&canonical_path) {
            if !content.trim().is_empty() {
                contents.push(content);
            }
        }
    }

    Ok(contents)
}

pub fn load_strings_conf(app: &AppHandle) -> MediaResult<String> {
    let mut aggregated = Vec::new();

    for dir in strings_dir_candidates(app) {
        if !dir.exists() {
            continue;
        }

        if let Ok(mut contents) = read_strings_directory(&dir) {
            aggregated.append(&mut contents);
        }
    }

    if !aggregated.is_empty() {
        return Ok(aggregated.join("\n"));
    }

    for path in legacy_strings_file_candidates(app) {
        if path.exists() {
            return read_strings_text_file(&path);
        }
    }

    Err(MediaError::invalid(
        "No valid strings text files found in configured locations",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::make_temp_dir;

    #[test]
    fn reads_and_sorts_valid_text_files_from_strings_directory() {
        let root = make_temp_dir("strings-dir");
        fs::write(root.join("b.conf"), "!setname 0x2 Beta").unwrap();
        fs::write(root.join("a.txt"), "!setname 0x1 Alpha").unwrap();
        fs::write(root.join("binary.bin"), [0u8, 159, 146, 150]).unwrap();
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(
            root.join("nested").join("ignored.txt"),
            "!setname 0x3 Gamma",
        )
        .unwrap();

        let result = read_strings_directory(&root).unwrap();

        assert_eq!(result.len(), 2);
        assert!(result[0].contains("Alpha"));
        assert!(result[1].contains("Beta"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_oversized_text_files() {
        let root = make_temp_dir("strings-size");
        let path = root.join("huge.conf");
        fs::write(
            &path,
            vec![b'a'; (MAX_STRINGS_TEXT_FILE_BYTES as usize) + 1],
        )
        .unwrap();

        let result = read_strings_text_file(&path);

        assert!(result.is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn dedupes_canonical_candidate_paths() {
        let root = make_temp_dir("strings-dedupe");
        let canonical = fs::canonicalize(&root).unwrap();
        let via_dot = root.join(".");

        let result = dedupe_candidate_paths(vec![root.clone(), via_dot, canonical.clone()]);

        assert_eq!(result.len(), 1);
        assert_eq!(fs::canonicalize(&result[0]).unwrap(), canonical);

        let _ = fs::remove_dir_all(&root);
    }
}
