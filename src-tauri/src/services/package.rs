use regex::Regex;
use rusqlite::Connection;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    io::{BufReader, BufWriter, Seek, Write},
    path::{Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{TaskProgressPayload, ZipPackageInfo};

const TYPE_SPELL_BIT: u32 = 0x2;
const SUBTYPE_FIELD_BIT: u32 = 0x80000;

#[derive(Debug, Clone, Default)]
struct CardPackageManifest {
    card_ids: Vec<u32>,
    field_spell_ids: Vec<u32>,
}

#[derive(Debug, Default)]
struct PackageResourceIndex {
    main_picture_paths: HashMap<u32, PathBuf>,
    field_picture_paths: HashMap<u32, PathBuf>,
    script_paths: HashMap<u32, PathBuf>,
    conf_paths: Vec<PathBuf>,
}

fn collect_card_package_manifest_from_cdb(cdb_path: &Path) -> Result<CardPackageManifest, String> {
    let conn = Connection::open(cdb_path).map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, type FROM datas WHERE id > 0 ORDER BY id")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, u32>(0)?, row.get::<_, u32>(1)?)))
        .map_err(|err| err.to_string())?;

    let mut manifest = CardPackageManifest::default();
    for row in rows {
        let (card_id, type_bits) = row.map_err(|err| err.to_string())?;
        manifest.card_ids.push(card_id);
        if (type_bits & TYPE_SPELL_BIT) != 0 && (type_bits & SUBTYPE_FIELD_BIT) != 0 {
            manifest.field_spell_ids.push(card_id);
        }
    }

    Ok(manifest)
}

fn parse_card_id_from_named_file(path: &Path, prefix: &str, extension: &str) -> Option<u32> {
    let file_name = path.file_name()?.to_str()?;
    let normalized_extension = extension.trim_start_matches('.');
    let stem = file_name
        .strip_suffix(&format!(".{normalized_extension}"))?
        .strip_prefix(prefix)?;
    stem.parse::<u32>().ok()
}

fn collect_package_resource_index(cdb_dir: &Path) -> Result<PackageResourceIndex, String> {
    let mut index = PackageResourceIndex::default();

    let pics_dir = cdb_dir.join("pics");
    if pics_dir.is_dir() {
        for entry in fs::read_dir(&pics_dir).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Some(card_id) = parse_card_id_from_named_file(&path, "", "jpg") {
                index.main_picture_paths.insert(card_id, path);
            }
        }

        let field_pics_dir = pics_dir.join("field");
        if field_pics_dir.is_dir() {
            for entry in fs::read_dir(&field_pics_dir).map_err(|err| err.to_string())? {
                let entry = entry.map_err(|err| err.to_string())?;
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                if let Some(card_id) = parse_card_id_from_named_file(&path, "", "jpg") {
                    index.field_picture_paths.insert(card_id, path);
                }
            }
        }
    }

    let script_dir = cdb_dir.join("script");
    if script_dir.is_dir() {
        for entry in fs::read_dir(&script_dir).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Some(card_id) = parse_card_id_from_named_file(&path, "c", "lua") {
                index.script_paths.insert(card_id, path);
            }
        }
    }

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
            index.conf_paths.push(path);
        }
    }

    index.conf_paths.sort();
    Ok(index)
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
    script_index: &HashMap<u32, PathBuf>,
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
        if let Some(script_path) = script_index.get(&card_id) {
            queued.push_back(script_path.clone());
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
    card_ids: &[u32],
    field_spell_ids: &[u32],
    main_picture_index: &HashMap<u32, PathBuf>,
    field_picture_index: &HashMap<u32, PathBuf>,
) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    for &card_id in card_ids {
        if let Some(pic_path) = main_picture_index.get(&card_id) {
            paths.push(pic_path.clone());
        }
    }

    for &card_id in field_spell_ids {
        if let Some(field_pic_path) = field_picture_index.get(&card_id) {
            paths.push(field_pic_path.clone());
        }
    }

    paths.sort();
    paths.dedup();
    paths
}

fn collect_package_source_paths(
    cdb_file_path: &Path,
    cdb_dir: &Path,
    manifest: &CardPackageManifest,
    resource_index: &PackageResourceIndex,
) -> Result<Vec<PathBuf>, String> {
    let mut paths = vec![cdb_file_path.to_path_buf()];
    paths.extend(collect_picture_paths_for_package(
        &manifest.card_ids,
        &manifest.field_spell_ids,
        &resource_index.main_picture_paths,
        &resource_index.field_picture_paths,
    ));
    paths.extend(resource_index.conf_paths.iter().cloned());
    paths.extend(collect_script_paths_for_package(
        cdb_dir,
        &manifest.card_ids,
        &resource_index.script_paths,
    )?);
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn build_temp_output_path(output_file_path: &Path) -> PathBuf {
    let extension = output_file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!("{value}.tmp"))
        .unwrap_or_else(|| "tmp".to_string());
    output_file_path.with_extension(extension)
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

fn emit_package_progress(
    progress: &mut dyn FnMut(TaskProgressPayload),
    stage: &str,
    current: usize,
    total: usize,
) {
    progress(TaskProgressPayload {
        task: "package".to_string(),
        stage: stage.to_string(),
        current: current as u32,
        total: total as u32,
    });
}

#[allow(dead_code)]
pub fn package_cdb_assets_as_zip(
    cdb_path: String,
    output_path: String,
) -> Result<ZipPackageInfo, String> {
    package_cdb_assets_as_zip_with_progress(cdb_path, output_path, &mut |_| {})
}

pub fn package_cdb_assets_as_zip_with_progress(
    cdb_path: String,
    output_path: String,
    progress: &mut dyn FnMut(TaskProgressPayload),
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
    let resource_index = collect_package_resource_index(cdb_dir)?;
    let source_paths = collect_package_source_paths(&cdb_file_path, cdb_dir, &manifest, &resource_index)?;

    if source_paths.iter().any(|path| path == &output_file_path) {
        return Err("Output path conflicts with a source asset".to_string());
    }

    if let Some(parent) = output_file_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let temp_output_file_path = build_temp_output_path(&output_file_path);
    if temp_output_file_path.exists() {
        fs::remove_file(&temp_output_file_path).map_err(|err| err.to_string())?;
    }

    let total_steps = source_paths.len() + 1;
    emit_package_progress(progress, "packaging", 0, total_steps);

    let zip_file = fs::File::create(&temp_output_file_path).map_err(|err| err.to_string())?;
    let writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(writer);

    for (index, source_path) in source_paths.iter().enumerate() {
        add_path_to_zip(&mut zip, source_path, cdb_dir)?;
        emit_package_progress(progress, "packaging", index + 1, total_steps);
    }

    zip.finish().map_err(|err| err.to_string())?;

    if output_file_path.exists() {
        fs::remove_file(&output_file_path).map_err(|err| err.to_string())?;
    }
    fs::rename(&temp_output_file_path, &output_file_path).map_err(|err| err.to_string())?;
    emit_package_progress(progress, "committing", total_steps, total_steps);

    Ok(ZipPackageInfo {
        path: output_file_path.to_string_lossy().to_string(),
    })
}
