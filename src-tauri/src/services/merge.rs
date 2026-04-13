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
    TaskProgressPayload,
    models::cdb::{
        AnalyzeCdbMergeResponse, CardDto, ExecuteCdbMergeRequest, ExecuteCdbMergeResponse,
        MergeSourceItemDto, MergeSourcePlanDto,
    },
    repository::cdb as cdb_repository,
};

const TYPE_SPELL: u32 = 0x2;
const SUBTYPE_FIELD: u32 = 0x80000;

#[derive(Debug, Clone)]
struct MergeSourceContext {
    path: String,
    name: String,
    dir: PathBuf,
    cards: Vec<CardDto>,
}

#[derive(Debug, Clone)]
struct MergePlan {
    sources: Vec<MergeSourceContext>,
    merged_cards: Vec<CardDto>,
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

fn card_has_field_subtype(card: &CardDto) -> bool {
    (card.type_ & TYPE_SPELL) != 0 && (card.type_ & SUBTYPE_FIELD) != 0
}

fn is_cdb_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("cdb"))
        .unwrap_or(false)
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
        let cards = cdb_repository::load_all_cards_from_path(Path::new(trimmed))?;
        sources.push(MergeSourceContext {
            path: trimmed.to_string(),
            name: basename(trimmed),
            dir: source_dir,
            cards,
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
    let mut merged_cards_by_code = HashMap::<u32, CardDto>::new();
    let mut duplicate_codes = HashSet::<u32>::new();
    let mut winning_card_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_main_image_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_field_image_source_by_code = HashMap::<u32, usize>::new();
    let mut winning_script_source_by_code = HashMap::<u32, usize>::new();

    for (source_index, source) in sources.iter().enumerate() {
        for card in &source.cards {
            if merged_cards_by_code.contains_key(&card.code) {
                duplicate_codes.insert(card.code);
            }

            merged_cards_by_code.insert(card.code, card.clone());
            winning_card_source_by_code.insert(card.code, source_index);

            if include_images {
                if main_image_path(&source.dir, card.code).is_file() {
                    winning_main_image_source_by_code.insert(card.code, source_index);
                }
                if field_image_path(&source.dir, card.code).is_file() {
                    winning_field_image_source_by_code.insert(card.code, source_index);
                }
            }

            if include_scripts && script_path(&source.dir, card.code).is_file() {
                winning_script_source_by_code.insert(card.code, source_index);
            }
        }
    }

    let mut merged_cards = merged_cards_by_code.into_values().collect::<Vec<_>>();
    merged_cards.sort_by_key(|card| card.code);

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
            if card_has_field_subtype(card)
                && plan.winning_field_image_source_by_code.get(&card.code).copied()
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
                card_has_field_subtype(card)
                    && plan.winning_field_image_source_by_code.contains_key(&card.code)
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

fn emit_merge_progress(
    progress: &mut dyn FnMut(TaskProgressPayload),
    stage: &str,
    current: usize,
    total: usize,
) {
    progress(TaskProgressPayload {
        task: "merge".to_string(),
        stage: stage.to_string(),
        current: current as u32,
        total: total as u32,
    });
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
                card_has_field_subtype(card)
                    && plan.winning_field_image_source_by_code.contains_key(&card.code)
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
    emit_merge_progress(progress, "merging", completed_steps, total_steps);

    cdb_repository::recreate_cdb_with_cards(&staged_cdb_path, &plan.merged_cards)?;
    completed_steps += 1;
    emit_merge_progress(progress, "merging", completed_steps, total_steps);

    if request.include_images {
        for card in &plan.merged_cards {
            if let Some(&winner_index) = plan.winning_main_image_source_by_code.get(&card.code) {
                let winner_dir = &plan.sources[winner_index].dir;
                let _ = copy_if_exists(
                    &main_image_path(winner_dir, card.code),
                    &staged_pics_dir.join(format!("{}.jpg", card.code)),
                )?;
                completed_steps += 1;
                emit_merge_progress(progress, "merging", completed_steps, total_steps);
            }

            if card_has_field_subtype(card) {
                if let Some(&winner_index) = plan.winning_field_image_source_by_code.get(&card.code)
                {
                    let winner_dir = &plan.sources[winner_index].dir;
                    let _ = copy_if_exists(
                        &field_image_path(winner_dir, card.code),
                        &staged_field_pics_dir.join(format!("{}.jpg", card.code)),
                    )?;
                    completed_steps += 1;
                    emit_merge_progress(progress, "merging", completed_steps, total_steps);
                }
            }
        }
    }

    if request.include_scripts {
        for card in &plan.merged_cards {
            if let Some(&winner_index) = plan.winning_script_source_by_code.get(&card.code) {
                let winner_dir = &plan.sources[winner_index].dir;
                let _ = copy_if_exists(
                    &script_path(winner_dir, card.code),
                    &staged_script_dir.join(format!("c{}.lua", card.code)),
                )?;
                completed_steps += 1;
                emit_merge_progress(progress, "merging", completed_steps, total_steps);
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
    emit_merge_progress(progress, "committing", completed_steps, total_steps);

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
