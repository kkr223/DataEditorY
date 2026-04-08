use regex::Regex;
use std::{
    collections::{HashSet, VecDeque},
    fs,
    io::{BufReader, BufWriter, Seek, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::ZipPackageInfo;

const TYPE_SPELL_BIT: i64 = 0x2;
const SUBTYPE_FIELD_BIT: i64 = 0x80000;

#[derive(Debug, Clone, Default)]
struct CardPackageManifest {
    card_ids: Vec<u32>,
    field_spell_ids: Vec<u32>,
}

fn collect_card_package_manifest_from_cdb(cdb_path: &Path) -> Result<CardPackageManifest, String> {
    let conn = rusqlite::Connection::open(cdb_path).map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, type FROM datas")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
        .map_err(|err| err.to_string())?;

    let mut manifest = CardPackageManifest::default();
    for row in rows {
        let (id, card_type) = row.map_err(|err| err.to_string())?;
        if id > 0 {
            let card_id = id as u32;
            manifest.card_ids.push(card_id);
            if (card_type & TYPE_SPELL_BIT) != 0 && (card_type & SUBTYPE_FIELD_BIT) != 0 {
                manifest.field_spell_ids.push(card_id);
            }
        }
    }

    manifest.card_ids.sort_unstable();
    manifest.card_ids.dedup();
    manifest.field_spell_ids.sort_unstable();
    manifest.field_spell_ids.dedup();

    Ok(manifest)
}

pub(crate) fn resolve_script_dependency_path(
    cdb_dir: &Path,
    script_dir: &Path,
    raw_path: &str,
) -> Option<PathBuf> {
    let trimmed = raw_path.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return None;
    }

    let relative = Path::new(&trimmed);
    let joined = if relative.is_absolute() {
        relative.to_path_buf()
    } else if trimmed.starts_with("script/") {
        cdb_dir.join(relative)
    } else {
        script_dir.join(relative)
    };

    let workspace_root = cdb_dir
        .canonicalize()
        .unwrap_or_else(|_| cdb_dir.to_path_buf());
    let normalized = joined.canonicalize().unwrap_or(joined);
    if normalized.starts_with(&workspace_root) && normalized.is_file() {
        Some(normalized)
    } else {
        None
    }
}

fn collect_script_paths_for_package(
    cdb_dir: &Path,
    card_ids: &[u32],
) -> Result<Vec<PathBuf>, String> {
    let script_dir = cdb_dir.join("script");
    if !script_dir.exists() || !script_dir.is_dir() {
        return Ok(Vec::new());
    }

    let load_script_pattern = Regex::new(r#"Duel\.LoadScript\s*\(\s*["']([^"']+)["']\s*\)"#)
        .map_err(|err| err.to_string())?;
    let mut queued = VecDeque::new();
    let mut visited = HashSet::new();
    let mut collected = Vec::new();

    for &card_id in card_ids {
        let script_path = script_dir.join(format!("c{card_id}.lua"));
        if script_path.is_file() {
            queued.push_back(script_path);
        }
    }

    while let Some(path) = queued.pop_front() {
        let normalized = path.canonicalize().unwrap_or(path.clone());
        if !visited.insert(normalized.clone()) {
            continue;
        }

        collected.push(normalized.clone());

        let content = match fs::read_to_string(&normalized) {
            Ok(content) => content,
            Err(_) => continue,
        };

        for capture in load_script_pattern.captures_iter(&content) {
            let Some(raw_dependency) = capture.get(1).map(|item| item.as_str()) else {
                continue;
            };

            if let Some(dependency_path) =
                resolve_script_dependency_path(cdb_dir, &script_dir, raw_dependency)
            {
                queued.push_back(dependency_path);
            }
        }
    }

    collected.sort();
    Ok(collected)
}

fn collect_picture_paths_for_package(
    cdb_dir: &Path,
    card_ids: &[u32],
    field_spell_ids: &[u32],
) -> Vec<PathBuf> {
    let pics_dir = cdb_dir.join("pics");
    let field_pics_dir = pics_dir.join("field");
    let mut paths = Vec::new();

    for &card_id in card_ids {
        let pic_path = pics_dir.join(format!("{card_id}.jpg"));
        if pic_path.is_file() {
            paths.push(pic_path);
        }
    }

    for &card_id in field_spell_ids {
        let field_pic_path = field_pics_dir.join(format!("{card_id}.jpg"));
        if field_pic_path.is_file() {
            paths.push(field_pic_path);
        }
    }

    paths.sort();
    paths.dedup();
    paths
}

fn collect_conf_paths_for_package(cdb_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();

    for entry in fs::read_dir(cdb_dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let is_conf = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("conf"))
            .unwrap_or(false);
        if is_conf {
            paths.push(path);
        }
    }

    paths.sort();
    Ok(paths)
}

pub(crate) fn path_to_zip_entry(path: &Path, base_dir: &Path) -> Result<String, String> {
    let relative = match path.strip_prefix(base_dir) {
        Ok(relative) => relative.to_path_buf(),
        Err(_) => {
            let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
            let normalized_base_dir = base_dir
                .canonicalize()
                .unwrap_or_else(|_| base_dir.to_path_buf());
            normalized_path
                .strip_prefix(&normalized_base_dir)
                .map_err(|err| err.to_string())?
                .to_path_buf()
        }
    };
    let entry = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");

    if entry.is_empty() {
        return Err("Unable to build zip entry path".to_string());
    }

    Ok(entry)
}

fn add_path_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    path: &Path,
    base_dir: &Path,
) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    let entry_name = path_to_zip_entry(path, base_dir)?;

    if metadata.is_dir() {
        let dir_name = if entry_name.ends_with('/') {
            entry_name
        } else {
            format!("{entry_name}/")
        };
        zip.add_directory(dir_name, SimpleFileOptions::default())
            .map_err(|err| err.to_string())?;

        for child in fs::read_dir(path).map_err(|err| err.to_string())? {
            let child = child.map_err(|err| err.to_string())?;
            add_path_to_zip(zip, &child.path(), base_dir)?;
        }
        return Ok(());
    }

    zip.start_file(
        entry_name,
        SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
    )
    .map_err(|err| err.to_string())?;

    let mut file = BufReader::new(fs::File::open(path).map_err(|err| err.to_string())?);
    std::io::copy(&mut file, zip)
        .map(|_| ())
        .map_err(|err| err.to_string())
}

pub fn package_cdb_assets_as_zip(
    cdb_path: String,
    output_path: String,
) -> Result<ZipPackageInfo, String> {
    let cdb_file_path = PathBuf::from(&cdb_path);
    if !cdb_file_path.exists() || !cdb_file_path.is_file() {
        return Err("CDB file not found".to_string());
    }

    let cdb_dir = cdb_file_path
        .parent()
        .ok_or_else(|| "Unable to resolve the database directory".to_string())?;
    let output_file_path = PathBuf::from(&output_path);
    let manifest = collect_card_package_manifest_from_cdb(&cdb_file_path)?;

    if let Some(parent) = output_file_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let zip_file = fs::File::create(&output_file_path).map_err(|err| err.to_string())?;
    let writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(writer);

    add_path_to_zip(&mut zip, &cdb_file_path, cdb_dir)?;
    for pic_path in
        collect_picture_paths_for_package(cdb_dir, &manifest.card_ids, &manifest.field_spell_ids)
    {
        add_path_to_zip(&mut zip, &pic_path, cdb_dir)?;
    }
    for conf_path in collect_conf_paths_for_package(cdb_dir)? {
        add_path_to_zip(&mut zip, &conf_path, cdb_dir)?;
    }
    for script_path in collect_script_paths_for_package(cdb_dir, &manifest.card_ids)? {
        add_path_to_zip(&mut zip, &script_path, cdb_dir)?;
    }

    zip.finish().map_err(|err| err.to_string())?;

    Ok(ZipPackageInfo {
        path: output_file_path.to_string_lossy().to_string(),
    })
}
