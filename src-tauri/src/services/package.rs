use regex::Regex;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    io::{BufReader, BufWriter, Seek, Write},
    path::{Component, Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{
    repository::cdb as cdb_repository, TaskProgressPayload, ThrottledProgressEmitter,
    ZipPackageInfo,
};

#[derive(Debug, Clone, Default)]
struct CardPackageManifest {
    cards: Vec<CardPackageEntry>,
}

#[derive(Debug, Clone)]
struct CardPackageEntry {
    fields: HashMap<String, String>,
}

fn collect_card_package_manifest_from_cdb(cdb_path: &Path) -> Result<CardPackageManifest, String> {
    let cards = cdb_repository::load_all_cards_from_path(cdb_path)?;
    Ok(CardPackageManifest {
        cards: cards
            .into_iter()
            .map(|card| {
                let mut fields = HashMap::new();
                fields.insert("code".to_string(), card.code.to_string());
                fields.insert("name".to_string(), card.name);
                CardPackageEntry { fields }
            })
            .collect(),
    })
}

pub(crate) fn resolve_script_dependency_path(
    canonical_workspace_root: &Path,
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
        canonical_workspace_root.join(relative)
    } else {
        script_dir.join(relative)
    };

    let normalized = joined.canonicalize().unwrap_or(joined);
    if normalized.starts_with(canonical_workspace_root) && normalized.is_file() {
        Some(normalized)
    } else {
        None
    }
}

fn collect_script_dependency_paths_for_package(
    cdb_dir: &Path,
    script_roots: &[PathBuf],
) -> Result<Vec<PathBuf>, String> {
    let script_dir = cdb_dir.join("script");
    if !script_dir.exists() || !script_dir.is_dir() {
        return Ok(Vec::new());
    }

    let canonical_root = cdb_dir
        .canonicalize()
        .unwrap_or_else(|_| cdb_dir.to_path_buf());

    let load_script_pattern = Regex::new(r#"Duel\.LoadScript\s*\(\s*["']([^"']+)["']\s*\)"#)
        .map_err(|err| err.to_string())?;
    let mut queued = VecDeque::new();
    let mut visited = HashSet::new();
    let mut collected = Vec::new();

    for script_path in script_roots {
        queued.push_back(script_path.clone());
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
                resolve_script_dependency_path(&canonical_root, &script_dir, raw_dependency)
            {
                queued.push_back(dependency_path);
            }
        }
    }

    collected.sort();
    Ok(collected)
}

fn is_safe_relative_pattern(pattern: &str) -> bool {
    let candidate = Path::new(pattern);
    !candidate.is_absolute()
        && candidate
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
}

fn pattern_contains_card_field(pattern: &str) -> bool {
    pattern.contains('{') && pattern.contains('}')
}

fn render_package_pattern(pattern: &str, card: &CardPackageEntry) -> String {
    let placeholder_pattern = Regex::new(r"\{([A-Za-z0-9_]+)\}").expect("valid placeholder regex");
    placeholder_pattern
        .replace_all(pattern, |captures: &regex::Captures| {
            let key = captures
                .get(1)
                .map(|item| item.as_str())
                .unwrap_or_default();
            card.fields.get(key).cloned().unwrap_or_default()
        })
        .to_string()
}

fn wildcard_pattern_to_regex(pattern: &str) -> Result<Regex, String> {
    let mut source = String::from("^");
    for ch in pattern.chars() {
        match ch {
            '*' => source.push_str("[^/]*"),
            '/' => source.push('/'),
            _ => source.push_str(&regex::escape(&ch.to_string())),
        }
    }
    source.push('$');
    Regex::new(&source).map_err(|err| err.to_string())
}

fn collect_descendant_paths(path: &Path, paths: &mut Vec<PathBuf>) -> Result<(), String> {
    if path.is_file() {
        paths.push(path.to_path_buf());
        return Ok(());
    }

    if !path.is_dir() {
        return Ok(());
    }

    for child in fs::read_dir(path).map_err(|err| err.to_string())? {
        let child = child.map_err(|err| err.to_string())?;
        collect_descendant_paths(&child.path(), paths)?;
    }

    Ok(())
}

fn collect_all_workspace_paths(cdb_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut paths = Vec::new();
    collect_descendant_paths(cdb_dir, &mut paths)?;
    Ok(paths)
}

fn collect_paths_for_rendered_pattern(
    cdb_dir: &Path,
    rendered_pattern: &str,
    workspace_paths: &mut Option<Vec<PathBuf>>,
) -> Result<Vec<PathBuf>, String> {
    let normalized_pattern = rendered_pattern.trim().replace('\\', "/");
    if normalized_pattern.is_empty() || !is_safe_relative_pattern(&normalized_pattern) {
        return Ok(Vec::new());
    }

    if !normalized_pattern.contains('*') {
        let path = cdb_dir.join(Path::new(&normalized_pattern));
        let mut paths = Vec::new();
        collect_descendant_paths(&path, &mut paths)?;
        return Ok(paths);
    }

    let matcher = wildcard_pattern_to_regex(&normalized_pattern)?;
    let workspace_paths = match workspace_paths {
        Some(paths) => paths,
        None => workspace_paths.insert(collect_all_workspace_paths(cdb_dir)?),
    };
    let mut paths = Vec::new();
    for path in workspace_paths {
        let Ok(relative) = path.strip_prefix(cdb_dir) else {
            continue;
        };
        let entry = relative
            .components()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if matcher.is_match(&entry) {
            paths.push(path.clone());
        }
    }

    Ok(paths)
}

fn collect_package_source_paths(
    cdb_file_path: &Path,
    cdb_dir: &Path,
    manifest: &CardPackageManifest,
    include_patterns: &[String],
) -> Result<Vec<PathBuf>, String> {
    let mut paths = vec![cdb_file_path.to_path_buf()];
    let mut workspace_paths = None;

    for pattern in include_patterns {
        if pattern_contains_card_field(pattern) {
            for card in &manifest.cards {
                let rendered = render_package_pattern(pattern, card);
                paths.extend(collect_paths_for_rendered_pattern(
                    cdb_dir,
                    &rendered,
                    &mut workspace_paths,
                )?);
            }
        } else {
            paths.extend(collect_paths_for_rendered_pattern(
                cdb_dir,
                pattern,
                &mut workspace_paths,
            )?);
        }
    }

    let script_roots = paths
        .iter()
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.eq_ignore_ascii_case("lua"))
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    paths.extend(collect_script_dependency_paths_for_package(
        cdb_dir,
        &script_roots,
    )?);
    paths = paths
        .into_iter()
        .map(|path| path.canonicalize().unwrap_or(path))
        .collect();
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

#[allow(dead_code)]
pub fn package_cdb_assets_as_zip(
    cdb_path: String,
    output_path: String,
) -> Result<ZipPackageInfo, String> {
    package_cdb_assets_as_zip_with_progress(
        cdb_path,
        output_path,
        crate::DEFAULT_PACKAGE_INCLUDE_PATTERNS
            .iter()
            .map(|item| item.to_string())
            .collect(),
        &mut |_| {},
    )
}

pub fn package_cdb_assets_as_zip_with_progress(
    cdb_path: String,
    output_path: String,
    include_patterns: Vec<String>,
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
    let source_paths =
        collect_package_source_paths(&cdb_file_path, cdb_dir, &manifest, &include_patterns)?;

    let comparable_output_file_path = output_file_path
        .canonicalize()
        .unwrap_or_else(|_| output_file_path.clone());
    if source_paths
        .iter()
        .any(|path| path == &comparable_output_file_path)
    {
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
    let mut throttled = ThrottledProgressEmitter::new("package", progress);
    throttled.emit("packaging", 0, total_steps);

    let zip_file = fs::File::create(&temp_output_file_path).map_err(|err| err.to_string())?;
    let writer = BufWriter::new(zip_file);
    let mut zip = ZipWriter::new(writer);

    for (index, source_path) in source_paths.iter().enumerate() {
        add_path_to_zip(&mut zip, source_path, cdb_dir)?;
        throttled.emit("packaging", index + 1, total_steps);
    }

    zip.finish().map_err(|err| err.to_string())?;

    if output_file_path.exists() {
        fs::remove_file(&output_file_path).map_err(|err| err.to_string())?;
    }
    fs::rename(&temp_output_file_path, &output_file_path).map_err(|err| err.to_string())?;
    throttled.emit("committing", total_steps, total_steps);

    Ok(ZipPackageInfo {
        path: output_file_path.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::{create_test_cdb, make_temp_dir};
    use std::path::Path;
    use zip::ZipArchive;

    #[test]
    fn builds_zip_entries_with_forward_slashes() {
        let base_dir = Path::new("workspace");
        let nested_path = Path::new("workspace").join("script").join("c100.lua");

        let entry = path_to_zip_entry(&nested_path, base_dir).unwrap();

        assert_eq!(entry, "script/c100.lua");
    }

    #[test]
    fn resolves_script_dependencies_inside_workspace_only() {
        let cdb_dir = make_temp_dir("script-deps");
        let script_dir = cdb_dir.join("script");
        fs::create_dir_all(script_dir.join("shared")).unwrap();

        let local_script = script_dir.join("utility.lua");
        let nested_script = script_dir.join("shared").join("common.lua");
        fs::write(&local_script, "-- local").unwrap();
        fs::write(&nested_script, "-- nested").unwrap();

        let escaped_path = cdb_dir.parent().unwrap().join("dataeditory-outside.lua");
        fs::write(&escaped_path, "-- outside").unwrap();

        let canonical_root = cdb_dir.canonicalize().unwrap();

        let resolved_local =
            resolve_script_dependency_path(&canonical_root, &script_dir, "utility.lua").unwrap();
        let resolved_prefixed = resolve_script_dependency_path(
            &canonical_root,
            &script_dir,
            "script/shared/common.lua",
        )
        .unwrap();
        let escaped = resolve_script_dependency_path(
            &canonical_root,
            &script_dir,
            "../../dataeditory-outside.lua",
        );

        assert_eq!(resolved_local.file_name().unwrap(), "utility.lua");
        assert_eq!(resolved_prefixed.file_name().unwrap(), "common.lua");
        assert!(escaped.is_none());

        let _ = fs::remove_file(&escaped_path);
        let _ = fs::remove_dir_all(&cdb_dir);
    }

    #[test]
    fn packages_only_current_cdb_card_assets() {
        let root = make_temp_dir("package-assets");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");
        let field_pics_dir = pics_dir.join("field");
        let script_dir = root.join("script");
        let output_zip_path = root.join("cards.zip");

        fs::create_dir_all(&field_pics_dir).unwrap();
        fs::create_dir_all(&script_dir).unwrap();

        create_test_cdb(&cdb_path, &[(111, 0x2 | 0x80000), (222, 0x1)]);

        fs::write(pics_dir.join("111.jpg"), [1u8]).unwrap();
        fs::write(pics_dir.join("222.jpg"), [2u8]).unwrap();
        fs::write(pics_dir.join("333.jpg"), [3u8]).unwrap();
        fs::write(field_pics_dir.join("111.jpg"), [4u8]).unwrap();
        fs::write(field_pics_dir.join("222.jpg"), [5u8]).unwrap();
        fs::write(
            script_dir.join("c111.lua"),
            "Duel.LoadScript(\"utility.lua\")",
        )
        .unwrap();
        fs::write(script_dir.join("c222.lua"), "-- direct").unwrap();
        fs::write(script_dir.join("c333.lua"), "-- unrelated").unwrap();
        fs::write(script_dir.join("utility.lua"), "-- shared").unwrap();
        fs::write(root.join("strings.conf"), "# strings").unwrap();
        fs::write(root.join("lflist.conf"), "# lf").unwrap();
        fs::write(root.join("custom.CONF"), "# custom").unwrap();
        fs::write(root.join("notes.txt"), "ignore").unwrap();

        package_cdb_assets_as_zip(
            cdb_path.to_string_lossy().to_string(),
            output_zip_path.to_string_lossy().to_string(),
        )
        .unwrap();

        let zip_file = fs::File::open(&output_zip_path).unwrap();
        let mut archive = ZipArchive::new(zip_file).unwrap();
        let mut entries = Vec::new();
        for index in 0..archive.len() {
            entries.push(archive.by_index(index).unwrap().name().to_string());
        }
        entries.sort();

        assert!(entries.contains(&"cards.cdb".to_string()));
        assert!(entries.contains(&"pics/111.jpg".to_string()));
        assert!(entries.contains(&"pics/222.jpg".to_string()));
        assert!(entries.contains(&"pics/field/111.jpg".to_string()));
        assert!(entries.contains(&"pics/field/222.jpg".to_string()));
        assert!(entries.contains(&"script/c111.lua".to_string()));
        assert!(entries.contains(&"script/c222.lua".to_string()));
        assert!(entries.contains(&"script/utility.lua".to_string()));
        assert!(entries.contains(&"strings.conf".to_string()));
        assert!(entries.contains(&"lflist.conf".to_string()));
        assert!(!entries.contains(&"custom.CONF".to_string()));
        assert!(!entries.contains(&"pics/333.jpg".to_string()));
        assert!(!entries.contains(&"script/c333.lua".to_string()));
        assert!(!entries.contains(&"notes.txt".to_string()));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn packaging_keeps_source_assets_intact() {
        let root = make_temp_dir("package-assets-preserve");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");
        let script_dir = root.join("script");
        let output_zip_path = root.join("cards.zip");

        fs::create_dir_all(&pics_dir).unwrap();
        fs::create_dir_all(&script_dir).unwrap();

        create_test_cdb(&cdb_path, &[(111, 0x1)]);
        fs::write(pics_dir.join("111.jpg"), [1u8, 2u8, 3u8]).unwrap();
        fs::write(script_dir.join("c111.lua"), "print('hello')").unwrap();

        package_cdb_assets_as_zip(
            cdb_path.to_string_lossy().to_string(),
            output_zip_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(
            fs::read(pics_dir.join("111.jpg")).unwrap(),
            vec![1u8, 2u8, 3u8]
        );
        assert_eq!(
            fs::read_to_string(script_dir.join("c111.lua")).unwrap(),
            "print('hello')"
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn packaging_rejects_output_path_that_matches_source_asset() {
        let root = make_temp_dir("package-assets-conflict");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");

        fs::create_dir_all(&pics_dir).unwrap();
        create_test_cdb(&cdb_path, &[(111, 0x1)]);
        fs::write(pics_dir.join("111.jpg"), [9u8, 8u8, 7u8]).unwrap();

        let err = package_cdb_assets_as_zip(
            cdb_path.to_string_lossy().to_string(),
            pics_dir.join("111.jpg").to_string_lossy().to_string(),
        )
        .unwrap_err();

        assert!(err.contains("conflicts with a source asset"));
        assert_eq!(
            fs::read(pics_dir.join("111.jpg")).unwrap(),
            vec![9u8, 8u8, 7u8]
        );

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn custom_package_patterns_support_wildcards_and_card_fields() {
        let root = make_temp_dir("package-custom-patterns");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");
        let script_dir = root.join("script");
        let output_zip_path = root.join("cards.zip");

        fs::create_dir_all(&pics_dir).unwrap();
        fs::create_dir_all(&script_dir).unwrap();

        create_test_cdb(&cdb_path, &[(111, 0x1), (222, 0x1)]);
        fs::write(pics_dir.join("111.webp"), [1u8]).unwrap();
        fs::write(pics_dir.join("222.webp"), [2u8]).unwrap();
        fs::write(pics_dir.join("333.webp"), [3u8]).unwrap();
        fs::write(script_dir.join("111.lua"), "-- direct").unwrap();
        fs::write(script_dir.join("shared.lua"), "-- shared").unwrap();
        fs::write(root.join("readme.txt"), "pack me").unwrap();

        package_cdb_assets_as_zip_with_progress(
            cdb_path.to_string_lossy().to_string(),
            output_zip_path.to_string_lossy().to_string(),
            vec![
                "pics/{code}.webp".to_string(),
                "script/*.lua".to_string(),
                "readme.txt".to_string(),
            ],
            &mut |_| {},
        )
        .unwrap();

        let zip_file = fs::File::open(&output_zip_path).unwrap();
        let mut archive = ZipArchive::new(zip_file).unwrap();
        let mut entries = Vec::new();
        for index in 0..archive.len() {
            entries.push(archive.by_index(index).unwrap().name().to_string());
        }
        entries.sort();

        assert!(entries.contains(&"cards.cdb".to_string()));
        assert!(entries.contains(&"pics/111.webp".to_string()));
        assert!(entries.contains(&"pics/222.webp".to_string()));
        assert!(!entries.contains(&"pics/333.webp".to_string()));
        assert!(entries.contains(&"script/111.lua".to_string()));
        assert!(entries.contains(&"script/shared.lua".to_string()));
        assert!(entries.contains(&"readme.txt".to_string()));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn non_wildcard_patterns_do_not_package_descendants() {
        let root = make_temp_dir("package-no-wildcard-descendants");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");
        let output_zip_path = root.join("cards.zip");

        fs::create_dir_all(&pics_dir).unwrap();
        create_test_cdb(&cdb_path, &[(111, 0x1)]);
        fs::write(pics_dir.join("111.jpg"), [1u8]).unwrap();
        fs::write(pics_dir.join("unrelated.jpg"), [2u8]).unwrap();

        package_cdb_assets_as_zip_with_progress(
            cdb_path.to_string_lossy().to_string(),
            output_zip_path.to_string_lossy().to_string(),
            vec!["pics/{code}.jpg".to_string()],
            &mut |_| {},
        )
        .unwrap();

        let zip_file = fs::File::open(&output_zip_path).unwrap();
        let mut archive = ZipArchive::new(zip_file).unwrap();
        let mut entries = Vec::new();
        for index in 0..archive.len() {
            entries.push(archive.by_index(index).unwrap().name().to_string());
        }

        assert!(entries.contains(&"cards.cdb".to_string()));
        assert!(entries.contains(&"pics/111.jpg".to_string()));
        assert!(!entries.contains(&"pics/unrelated.jpg".to_string()));

        let _ = fs::remove_dir_all(&root);
    }
}
