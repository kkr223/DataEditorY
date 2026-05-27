use rand::RngCore;
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use crate::services::assets::{
    cdb_dir_from_path, copy_if_exists, field_image_path, main_image_path, script_path,
};
use crate::{
    models::cdb::{
        AnalyzeCdbMergeResponse, CardDto, ExecuteCdbMergeRequest, ExecuteCdbMergeResponse,
        MergeSourceItemDto, MergeSourcePlanDto,
    },
    repository::cdb as cdb_repository,
    TaskProgressPayload, ThrottledProgressEmitter,
};

const TYPE_SPELL: u32 = 0x2;
const SUBTYPE_FIELD: u32 = 0x80000;

/// Lightweight card representation used during the merge planning phase
/// to avoid loading 15+ fields per card into memory for every source CDB.
type CardSummary = (u32, u32); // (code, type)

/// Returns true for spell cards that have the Field subtype bit set.
fn summary_has_field_subtype(summary: &CardSummary) -> bool {
    let card_type = summary.1;
    (card_type & TYPE_SPELL) != 0 && (card_type & SUBTYPE_FIELD) != 0
}

#[derive(Debug, Clone)]
struct MergeSourceAssetIndex {
    main_image_codes: HashSet<u32>,
    field_image_codes: HashSet<u32>,
    script_codes: HashSet<u32>,
}

#[derive(Debug, Clone)]
struct MergeSourceContext {
    path: String,
    name: String,
    dir: PathBuf,
    cards: Vec<CardSummary>,
    assets: MergeSourceAssetIndex,
}

#[derive(Debug, Clone)]
struct MergePlan {
    sources: Vec<MergeSourceContext>,
    merged_cards: Vec<CardSummary>,
    duplicate_card_total: u32,
    winning_card_source_by_code: HashMap<u32, usize>,
    winning_main_image_source_by_code: HashMap<u32, usize>,
    winning_field_image_source_by_code: HashMap<u32, usize>,
    winning_script_source_by_code: HashMap<u32, usize>,
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown.cdb".to_string())
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|err| err.to_string())
}

fn build_stage_dir(output_path: &Path, label: &str) -> Result<PathBuf, String> {
    let mut nonce = [0_u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce);
    let parent = output_path
        .parent()
        .ok_or_else(|| "Unable to resolve the output directory".to_string())?;
    Ok(parent.join(format!(
        ".__dataeditory-{label}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        nonce[0], nonce[1], nonce[2], nonce[3], nonce[4], nonce[5], nonce[6], nonce[7]
    )))
}

fn is_cdb_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("cdb"))
        .unwrap_or(false)
}

fn parse_card_id_from_filename(name: &str, prefix: &str, extension: &str) -> Option<u32> {
    let stem = name
        .strip_suffix(&format!(".{extension}"))
        .or_else(|| {
            let upper_ext = format!(".{}", extension.to_ascii_uppercase());
            name.strip_suffix(&upper_ext)
        })?
        .strip_prefix(prefix)?;
    stem.parse::<u32>().ok()
}

fn scan_card_ids_in_dir(dir: &Path, prefix: &str, extension: &str) -> HashSet<u32> {
    let mut ids = HashSet::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return ids,
    };
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            if let Some(card_id) = parse_card_id_from_filename(name, prefix, extension) {
                ids.insert(card_id);
            }
        }
    }
    ids
}

fn build_source_asset_index(cdb_dir: &Path) -> MergeSourceAssetIndex {
    let pics_dir = cdb_dir.join("pics");
    let field_pics_dir = pics_dir.join("field");
    let script_dir = cdb_dir.join("script");

    MergeSourceAssetIndex {
        main_image_codes: scan_card_ids_in_dir(&pics_dir, "", "jpg"),
        field_image_codes: scan_card_ids_in_dir(&field_pics_dir, "", "jpg"),
        script_codes: scan_card_ids_in_dir(&script_dir, "c", "lua"),
    }
}

fn load_merge_sources(source_paths: &[String]) -> Result<Vec<MergeSourceContext>, String> {
    let mut seen = HashSet::new();
    let mut sources = Vec::new();

    for source_path in source_paths {
        let trimmed = source_path.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !seen.insert(trimmed.to_string()) {
            continue;
        }

        let source_dir = cdb_dir_from_path(trimmed)?;
        let cards = cdb_repository::load_card_summaries_from_path(Path::new(trimmed))?;
        let assets = build_source_asset_index(&source_dir);
        sources.push(MergeSourceContext {
            path: trimmed.to_string(),
            name: basename(trimmed),
            dir: source_dir,
            cards,
            assets,
        });
    }

    if sources.is_empty() {
        return Err("Please provide at least one CDB source".to_string());
    }

    Ok(sources)
}

fn build_merge_plan(
    source_paths: &[String],
    include_images: bool,
    include_scripts: bool,
) -> Result<MergePlan, String> {
    let sources = load_merge_sources(source_paths)?;
    let mut merged_cards_by_code = HashMap::<u32, CardSummary>::new();
    let mut duplicate_codes = HashSet::<u32>::new();
    let mut winning_card_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_main_image_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_field_image_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_script_source_by_code = HashMap::<u32, usize>::new();

    for (source_index, source) in sources.iter().enumerate() {
        for card in &source.cards {
            let code = card.0;
            if merged_cards_by_code.contains_key(&code) {
                duplicate_codes.insert(code);
            }

            merged_cards_by_code.insert(code, *card);
            winning_card_source_by_code.insert(code, source_index);

            if include_images {
                if source.assets.main_image_codes.contains(&code) {
                    winning_main_image_source_by_code.insert(code, source_index);
                }
                if source.assets.field_image_codes.contains(&code) {
                    winning_field_image_source_by_code.insert(code, source_index);
                }
            }

            if include_scripts && source.assets.script_codes.contains(&code) {
                winning_script_source_by_code.insert(code, source_index);
            }
        }
    }

    let mut merged_cards = merged_cards_by_code.into_values().collect::<Vec<_>>();
    merged_cards.sort_by_key(|card| card.0);

    Ok(MergePlan {
        sources,
        merged_cards,
        duplicate_card_total: duplicate_codes.len() as u32,
        winning_card_source_by_code,
        winning_main_image_source_by_code,
        winning_field_image_source_by_code,
        winning_script_source_by_code,
    })
}

fn build_analysis_response(plan: &MergePlan) -> AnalyzeCdbMergeResponse {
    let mut source_plans = Vec::with_capacity(plan.sources.len());

    for (source_index, source) in plan.sources.iter().enumerate() {
        let mut winning_field_image_count = 0_u32;
        for card in &plan.merged_cards {
            if summary_has_field_subtype(card)
                && plan
                    .winning_field_image_source_by_code
                    .get(&card.0)
                    .copied()
                    == Some(source_index)
            {
                winning_field_image_count += 1;
            }
        }

        source_plans.push(MergeSourcePlanDto {
            path: source.path.clone(),
            name: source.name.clone(),
            card_total: source.cards.len() as u32,
            winning_card_count: plan
                .winning_card_source_by_code
                .values()
                .filter(|&&winner_index| winner_index == source_index)
                .count() as u32,
            winning_main_image_count: plan
                .winning_main_image_source_by_code
                .values()
                .filter(|&&winner_index| winner_index == source_index)
                .count() as u32,
            winning_field_image_count,
            winning_script_count: plan
                .winning_script_source_by_code
                .values()
                .filter(|&&winner_index| winner_index == source_index)
                .count() as u32,
        });
    }

    AnalyzeCdbMergeResponse {
        source_count: plan.sources.len() as u32,
        merged_total: plan.merged_cards.len() as u32,
        duplicate_card_total: plan.duplicate_card_total,
        main_image_total: plan.winning_main_image_source_by_code.len() as u32,
        field_image_total: plan
            .merged_cards
            .iter()
            .filter(|card| {
                summary_has_field_subtype(card)
                    && plan
                        .winning_field_image_source_by_code
                        .contains_key(&card.0)
            })
            .count() as u32,
        script_total: plan.winning_script_source_by_code.len() as u32,
        sources: source_plans,
    }
}

fn derive_output_cdb_path(output_dir: &Path) -> PathBuf {
    let folder_name = output_dir
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("merged");
    output_dir.join(format!("{folder_name}.cdb"))
}

fn validate_output_dir(output_dir: &Path, sources: &[MergeSourceContext]) -> Result<(), String> {
    let normalized_output_dir = output_dir
        .canonicalize()
        .unwrap_or_else(|_| output_dir.to_path_buf());
    for source in sources {
        let normalized_source_dir = source
            .dir
            .canonicalize()
            .unwrap_or_else(|_| source.dir.clone());
        if normalized_output_dir == normalized_source_dir {
            return Err(format!(
                "Output folder cannot be the same as a source project folder: {}",
                source.dir.to_string_lossy()
            ));
        }
    }
    Ok(())
}

pub fn collect_merge_sources_from_folder(
    directory_path: &str,
) -> Result<Vec<MergeSourceItemDto>, String> {
    let root = PathBuf::from(directory_path);
    if !root.exists() || !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut project_dirs = fs::read_dir(&root)
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    project_dirs.sort_by_key(|entry| entry.file_name());

    let mut sources = Vec::new();
    for project_dir in project_dirs {
        let project_path = project_dir.path();
        if !project_path.is_dir() {
            continue;
        }

        let mut cdb_files = fs::read_dir(&project_path)
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;
        cdb_files.sort_by_key(|entry| entry.file_name());

        for cdb_file in cdb_files {
            let cdb_path = cdb_file.path();
            if !cdb_path.is_file() || !is_cdb_file(&cdb_path) {
                continue;
            }

            let cards = cdb_repository::load_all_cards_from_path(&cdb_path)?;
            sources.push(MergeSourceItemDto {
                path: cdb_path.to_string_lossy().to_string(),
                name: cdb_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| "unknown.cdb".to_string()),
                project_dir: project_path.to_string_lossy().to_string(),
                card_total: cards.len() as u32,
            });
        }
    }

    Ok(sources)
}

pub fn analyze_cdb_merge_paths(
    source_paths: &[String],
    include_images: bool,
    include_scripts: bool,
) -> Result<AnalyzeCdbMergeResponse, String> {
    let plan = build_merge_plan(source_paths, include_images, include_scripts)?;
    Ok(build_analysis_response(&plan))
}

#[allow(dead_code)]
pub fn execute_cdb_merge(
    request: ExecuteCdbMergeRequest,
) -> Result<ExecuteCdbMergeResponse, String> {
    execute_cdb_merge_with_progress(request, &mut |_| {})
}

pub fn execute_cdb_merge_with_progress(
    request: ExecuteCdbMergeRequest,
    progress: &mut dyn FnMut(TaskProgressPayload),
) -> Result<ExecuteCdbMergeResponse, String> {
    let plan = build_merge_plan(
        &request.source_paths,
        request.include_images,
        request.include_scripts,
    )?;
    let output_dir = PathBuf::from(&request.output_dir);
    ensure_dir(&output_dir)?;
    validate_output_dir(&output_dir, &plan.sources)?;

    // Load full CardDto from source CDBs only for the execution phase
    // (the planning phase used lightweight summaries to avoid OOM).
    let mut source_cards_by_path: HashMap<String, HashMap<u32, CardDto>> = HashMap::new();
    for source_path in &request.source_paths {
        let trimmed = source_path.trim();
        if trimmed.is_empty() {
            continue;
        }
        let cards = cdb_repository::load_all_cards_from_path(Path::new(trimmed))?;
        let by_code: HashMap<u32, CardDto> =
            cards.into_iter().map(|card| (card.code, card)).collect();
        source_cards_by_path.insert(trimmed.to_string(), by_code);
    }

    let merged_cards: Vec<CardDto> = plan
        .merged_cards
        .iter()
        .filter_map(|summary| {
            let winner_index = plan.winning_card_source_by_code.get(&summary.0)?;
            let source_path = plan.sources[*winner_index].path.as_str();
            source_cards_by_path
                .get(source_path)?
                .get(&summary.0)
                .cloned()
        })
        .collect();

    let output_cdb_path = derive_output_cdb_path(&output_dir);
    ensure_parent_dir(&output_cdb_path)?;

    let stage_dir = build_stage_dir(&output_cdb_path, "merge")?;
    ensure_dir(&stage_dir)?;
    let staged_cdb_path = stage_dir.join(
        output_cdb_path
            .file_name()
            .ok_or_else(|| "Unable to resolve output file name".to_string())?,
    );

    let staged_pics_dir = stage_dir.join("pics");
    let staged_field_pics_dir = staged_pics_dir.join("field");
    let staged_script_dir = stage_dir.join("script");

    let main_image_total = if request.include_images {
        plan.winning_main_image_source_by_code.len()
    } else {
        0
    };
    let field_image_total = if request.include_images {
        plan.merged_cards
            .iter()
            .filter(|card| {
                summary_has_field_subtype(card)
                    && plan
                        .winning_field_image_source_by_code
                        .contains_key(&card.0)
            })
            .count()
    } else {
        0
    };
    let script_total = if request.include_scripts {
        plan.winning_script_source_by_code.len()
    } else {
        0
    };
    let total_steps = 1 + main_image_total + field_image_total + script_total + 1;
    let mut completed_steps = 0_usize;
    let mut throttled = ThrottledProgressEmitter::new("merge", progress);
    throttled.emit("merging", completed_steps, total_steps);

    cdb_repository::recreate_cdb_with_cards(&staged_cdb_path, &merged_cards)?;
    completed_steps += 1;
    throttled.emit("merging", completed_steps, total_steps);

    if request.include_images {
        for card in &plan.merged_cards {
            let code = card.0;
            if let Some(&winner_index) = plan.winning_main_image_source_by_code.get(&code) {
                let winner_dir = &plan.sources[winner_index].dir;
                let _ = copy_if_exists(
                    &main_image_path(winner_dir, code),
                    &staged_pics_dir.join(format!("{code}.jpg")),
                )?;
                completed_steps += 1;
                throttled.emit("merging", completed_steps, total_steps);
            }

            if summary_has_field_subtype(card) {
                if let Some(&winner_index) = plan.winning_field_image_source_by_code.get(&code) {
                    let winner_dir = &plan.sources[winner_index].dir;
                    let _ = copy_if_exists(
                        &field_image_path(winner_dir, code),
                        &staged_field_pics_dir.join(format!("{code}.jpg")),
                    )?;
                    completed_steps += 1;
                    throttled.emit("merging", completed_steps, total_steps);
                }
            }
        }
    }

    if request.include_scripts {
        for card in &plan.merged_cards {
            let code = card.0;
            if let Some(&winner_index) = plan.winning_script_source_by_code.get(&code) {
                let winner_dir = &plan.sources[winner_index].dir;
                let _ = copy_if_exists(
                    &script_path(winner_dir, code),
                    &staged_script_dir.join(format!("c{code}.lua")),
                )?;
                completed_steps += 1;
                throttled.emit("merging", completed_steps, total_steps);
            }
        }
    }

    let target_pics_dir = output_dir.join("pics");
    let target_script_dir = output_dir.join("script");
    let backup_cdb_path = output_dir.join(".__dataeditory-merge-backup.cdb");
    let backup_pics_dir = output_dir.join(".__dataeditory-merge-backup-pics");
    let backup_script_dir = output_dir.join(".__dataeditory-merge-backup-script");

    let mut moved_cdb = false;
    let mut moved_pics = false;
    let mut moved_scripts = false;

    let commit_result = (|| -> Result<(), String> {
        if output_cdb_path.exists() {
            if backup_cdb_path.exists() {
                fs::remove_file(&backup_cdb_path).map_err(|err| err.to_string())?;
            }
            fs::rename(&output_cdb_path, &backup_cdb_path).map_err(|err| err.to_string())?;
        }

        if request.include_images && target_pics_dir.exists() {
            if backup_pics_dir.exists() {
                fs::remove_dir_all(&backup_pics_dir).map_err(|err| err.to_string())?;
            }
            fs::rename(&target_pics_dir, &backup_pics_dir).map_err(|err| err.to_string())?;
        }

        if request.include_scripts && target_script_dir.exists() {
            if backup_script_dir.exists() {
                fs::remove_dir_all(&backup_script_dir).map_err(|err| err.to_string())?;
            }
            fs::rename(&target_script_dir, &backup_script_dir).map_err(|err| err.to_string())?;
        }

        fs::rename(&staged_cdb_path, &output_cdb_path).map_err(|err| err.to_string())?;
        moved_cdb = true;

        if request.include_images && staged_pics_dir.exists() {
            fs::rename(&staged_pics_dir, &target_pics_dir).map_err(|err| err.to_string())?;
            moved_pics = true;
        }

        if request.include_scripts && staged_script_dir.exists() {
            fs::rename(&staged_script_dir, &target_script_dir).map_err(|err| err.to_string())?;
            moved_scripts = true;
        }

        Ok(())
    })();

    if let Err(error) = commit_result {
        if moved_scripts {
            let _ = fs::remove_dir_all(&target_script_dir);
        }
        if moved_pics {
            let _ = fs::remove_dir_all(&target_pics_dir);
        }
        if moved_cdb {
            let _ = fs::remove_file(&output_cdb_path);
        }
        if backup_cdb_path.exists() {
            let _ = fs::rename(&backup_cdb_path, &output_cdb_path);
        }
        if backup_pics_dir.exists() {
            let _ = fs::rename(&backup_pics_dir, &target_pics_dir);
        }
        if backup_script_dir.exists() {
            let _ = fs::rename(&backup_script_dir, &target_script_dir);
        }
        let _ = fs::remove_dir_all(&stage_dir);
        return Err(error);
    }

    completed_steps += 1;
    throttled.emit("committing", completed_steps, total_steps);

    if backup_cdb_path.exists() {
        let _ = fs::remove_file(&backup_cdb_path);
    }
    if backup_pics_dir.exists() {
        let _ = fs::remove_dir_all(&backup_pics_dir);
    }
    if backup_script_dir.exists() {
        let _ = fs::remove_dir_all(&backup_script_dir);
    }
    let _ = fs::remove_dir_all(&stage_dir);

    Ok(ExecuteCdbMergeResponse {
        output_path: output_cdb_path.to_string_lossy().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::{create_test_cdb, make_temp_dir};

    fn create_source(root: &Path, name: &str, cards: &[(u32, i64)]) -> PathBuf {
        let source_dir = root.join(name);
        fs::create_dir_all(source_dir.join("pics").join("field")).unwrap();
        fs::create_dir_all(source_dir.join("script")).unwrap();
        let cdb_path = source_dir.join(format!("{name}.cdb"));
        create_test_cdb(&cdb_path, cards);
        cdb_path
    }

    fn write_source_asset(source_cdb_path: &Path, relative_path: &str, content: &[u8]) {
        let source_dir = source_cdb_path.parent().unwrap();
        let path = source_dir.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn merge_plan_prefers_later_sources_for_card_and_asset_conflicts() {
        let root = make_temp_dir("merge-plan-conflicts");
        let source_a = create_source(
            &root,
            "alpha",
            &[
                (100, 0x1),
                (200, (TYPE_SPELL | SUBTYPE_FIELD) as i64),
                (300, 0x1),
            ],
        );
        let source_b = create_source(
            &root,
            "beta",
            &[
                (200, (TYPE_SPELL | SUBTYPE_FIELD) as i64),
                (400, (TYPE_SPELL | SUBTYPE_FIELD) as i64),
            ],
        );

        write_source_asset(&source_a, "pics/100.jpg", b"a-main-100");
        write_source_asset(&source_a, "pics/200.jpg", b"a-main-200");
        write_source_asset(&source_a, "pics/field/200.jpg", b"a-field-200");
        write_source_asset(&source_a, "script/c100.lua", b"a-script-100");
        write_source_asset(&source_a, "script/c200.lua", b"a-script-200");
        write_source_asset(&source_b, "pics/200.jpg", b"b-main-200");
        write_source_asset(&source_b, "pics/400.jpg", b"b-main-400");
        write_source_asset(&source_b, "pics/field/200.jpg", b"b-field-200");
        write_source_asset(&source_b, "pics/field/400.jpg", b"b-field-400");
        write_source_asset(&source_b, "script/c200.lua", b"b-script-200");
        write_source_asset(&source_b, "script/c400.lua", b"b-script-400");

        let paths = vec![
            source_a.to_string_lossy().to_string(),
            source_b.to_string_lossy().to_string(),
        ];
        let plan = build_merge_plan(&paths, true, true).unwrap();
        let response = build_analysis_response(&plan);

        assert_eq!(plan.duplicate_card_total, 1);
        assert_eq!(
            plan.merged_cards,
            vec![
                (100, 0x1),
                (200, TYPE_SPELL | SUBTYPE_FIELD),
                (300, 0x1),
                (400, TYPE_SPELL | SUBTYPE_FIELD)
            ]
        );
        assert_eq!(plan.winning_card_source_by_code.get(&200), Some(&1));
        assert_eq!(plan.winning_main_image_source_by_code.get(&200), Some(&1));
        assert_eq!(plan.winning_field_image_source_by_code.get(&200), Some(&1));
        assert_eq!(plan.winning_script_source_by_code.get(&200), Some(&1));

        assert_eq!(response.source_count, 2);
        assert_eq!(response.merged_total, 4);
        assert_eq!(response.duplicate_card_total, 1);
        assert_eq!(response.main_image_total, 3);
        assert_eq!(response.field_image_total, 2);
        assert_eq!(response.script_total, 3);
        assert_eq!(response.sources[0].winning_card_count, 2);
        assert_eq!(response.sources[0].winning_main_image_count, 1);
        assert_eq!(response.sources[0].winning_field_image_count, 0);
        assert_eq!(response.sources[0].winning_script_count, 1);
        assert_eq!(response.sources[1].winning_card_count, 2);
        assert_eq!(response.sources[1].winning_main_image_count, 2);
        assert_eq!(response.sources[1].winning_field_image_count, 2);
        assert_eq!(response.sources[1].winning_script_count, 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn merge_plan_respects_asset_include_flags() {
        let root = make_temp_dir("merge-plan-include-flags");
        let source = create_source(&root, "only", &[(100, (TYPE_SPELL | SUBTYPE_FIELD) as i64)]);
        write_source_asset(&source, "pics/100.jpg", b"main");
        write_source_asset(&source, "pics/field/100.jpg", b"field");
        write_source_asset(&source, "script/c100.lua", b"script");

        let paths = vec![source.to_string_lossy().to_string()];
        let response = analyze_cdb_merge_paths(&paths, false, false).unwrap();

        assert_eq!(response.merged_total, 1);
        assert_eq!(response.main_image_total, 0);
        assert_eq!(response.field_image_total, 0);
        assert_eq!(response.script_total, 0);
        assert_eq!(response.sources[0].winning_main_image_count, 0);
        assert_eq!(response.sources[0].winning_field_image_count, 0);
        assert_eq!(response.sources[0].winning_script_count, 0);

        let _ = fs::remove_dir_all(&root);
    }
}
