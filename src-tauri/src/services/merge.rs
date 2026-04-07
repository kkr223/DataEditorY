use rand::RngCore;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use crate::services::assets::{
    cdb_dir_from_path, copy_if_exists, field_image_path, main_image_path, script_path,
};
use crate::{
    models::cdb::{AnalyzeCdbMergeResponse, CardDto, ExecuteCdbMergeRequest, MergeConflictDto},
    repository::cdb as cdb_repository,
};

const TYPE_SPELL: u32 = 0x2;
const SUBTYPE_FIELD: u32 = 0x80000;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MergeSide {
    A,
    B,
}

fn choose_merge_side(
    conflict_mode: &str,
    code: u32,
    manual_choices: &HashMap<u32, String>,
) -> Result<MergeSide, String> {
    match conflict_mode {
        "preferA" => Ok(MergeSide::A),
        "preferB" => Ok(MergeSide::B),
        "manual" => match manual_choices.get(&code).map(|value| value.trim()) {
            Some("a") | Some("A") => Ok(MergeSide::A),
            Some("b") | Some("B") => Ok(MergeSide::B),
            _ => Err(format!("Missing manual merge choice for card {code}")),
        },
        other => Err(format!("Unsupported merge conflict mode: {other}")),
    }
}

fn card_has_field_subtype(card: &CardDto) -> bool {
    (card.type_ & TYPE_SPELL) != 0 && (card.type_ & SUBTYPE_FIELD) != 0
}

pub fn analyze_cdb_merge_paths(
    a_path: &str,
    b_path: &str,
) -> Result<AnalyzeCdbMergeResponse, String> {
    let a_cards = cdb_repository::load_all_cards_from_path(Path::new(a_path))?;
    let b_cards = cdb_repository::load_all_cards_from_path(Path::new(b_path))?;
    let a_dir = cdb_dir_from_path(a_path)?;
    let b_dir = cdb_dir_from_path(b_path)?;

    let a_by_code: HashMap<u32, CardDto> = a_cards
        .iter()
        .cloned()
        .map(|card| (card.code, card))
        .collect();
    let b_by_code: HashMap<u32, CardDto> = b_cards
        .iter()
        .cloned()
        .map(|card| (card.code, card))
        .collect();

    let mut all_codes = a_by_code.keys().copied().collect::<Vec<_>>();
    for code in b_by_code.keys().copied() {
        if !all_codes.contains(&code) {
            all_codes.push(code);
        }
    }
    all_codes.sort_unstable();

    let mut conflicts = Vec::new();
    for code in all_codes {
        let Some(a_card) = a_by_code.get(&code).cloned() else {
            continue;
        };
        let Some(b_card) = b_by_code.get(&code).cloned() else {
            continue;
        };

        let a_image = main_image_path(&a_dir, code).is_file();
        let b_image = main_image_path(&b_dir, code).is_file();
        let a_field_image = field_image_path(&a_dir, code).is_file();
        let b_field_image = field_image_path(&b_dir, code).is_file();
        let a_script = script_path(&a_dir, code).is_file();
        let b_script = script_path(&b_dir, code).is_file();

        let has_card_conflict = a_card != b_card;
        let has_image_conflict = a_image && b_image;
        let has_field_image_conflict = a_field_image && b_field_image;
        let has_script_conflict = a_script && b_script;

        if has_card_conflict
            || has_image_conflict
            || has_field_image_conflict
            || has_script_conflict
        {
            conflicts.push(MergeConflictDto {
                code,
                a_card,
                b_card,
                has_card_conflict,
                has_image_conflict,
                has_field_image_conflict,
                has_script_conflict,
            });
        }
    }

    let merged_total = {
        let mut unique_codes = a_by_code.keys().copied().collect::<Vec<_>>();
        for code in b_by_code.keys().copied() {
            if !unique_codes.contains(&code) {
                unique_codes.push(code);
            }
        }
        unique_codes.len() as u32
    };

    Ok(AnalyzeCdbMergeResponse {
        a_name: basename(a_path),
        b_name: basename(b_path),
        a_total: a_cards.len() as u32,
        b_total: b_cards.len() as u32,
        merged_total,
        conflicts,
    })
}

pub fn execute_cdb_merge(request: ExecuteCdbMergeRequest) -> Result<(), String> {
    let analysis = analyze_cdb_merge_paths(&request.a_path, &request.b_path)?;
    if request.conflict_mode == "manual" {
        for conflict in &analysis.conflicts {
            choose_merge_side(
                &request.conflict_mode,
                conflict.code,
                &request.manual_choices,
            )?;
        }
    }

    let a_cards = cdb_repository::load_all_cards_from_path(Path::new(&request.a_path))?;
    let b_cards = cdb_repository::load_all_cards_from_path(Path::new(&request.b_path))?;
    let a_dir = cdb_dir_from_path(&request.a_path)?;
    let b_dir = cdb_dir_from_path(&request.b_path)?;

    let mut merged_cards = HashMap::<u32, CardDto>::new();
    let mut preferred_side_by_code = HashMap::<u32, MergeSide>::new();

    for card in &a_cards {
        merged_cards.insert(card.code, card.clone());
        preferred_side_by_code.insert(card.code, MergeSide::A);
    }

    for card in &b_cards {
        match merged_cards.get(&card.code) {
            None => {
                merged_cards.insert(card.code, card.clone());
                preferred_side_by_code.insert(card.code, MergeSide::B);
            }
            Some(existing) => {
                let preferred_side = if existing == card {
                    preferred_side_by_code
                        .get(&card.code)
                        .copied()
                        .unwrap_or(MergeSide::A)
                } else {
                    choose_merge_side(&request.conflict_mode, card.code, &request.manual_choices)?
                };

                if preferred_side == MergeSide::B {
                    merged_cards.insert(card.code, card.clone());
                }
                preferred_side_by_code.insert(card.code, preferred_side);
            }
        }
    }

    let mut merged_cards_list = merged_cards.into_values().collect::<Vec<_>>();
    merged_cards_list.sort_by_key(|card| card.code);

    let output_path = PathBuf::from(&request.output_path);
    ensure_parent_dir(&output_path)?;

    let stage_dir = build_stage_dir(&output_path, "merge")?;
    ensure_dir(&stage_dir)?;
    let output_file_name = output_path
        .file_name()
        .ok_or_else(|| "Unable to resolve output file name".to_string())?;
    let staged_cdb_path = stage_dir.join(output_file_name);

    let staged_pics_dir = stage_dir.join("pics");
    let staged_field_pics_dir = staged_pics_dir.join("field");
    let staged_script_dir = stage_dir.join("script");

    cdb_repository::recreate_cdb_with_cards(&staged_cdb_path, &merged_cards_list)?;

    if request.include_images {
        for card in &merged_cards_list {
            let code = card.code;
            let preferred_side = preferred_side_by_code
                .get(&code)
                .copied()
                .unwrap_or(MergeSide::A);
            let preferred_dir = if preferred_side == MergeSide::A {
                &a_dir
            } else {
                &b_dir
            };
            let fallback_dir = if preferred_side == MergeSide::A {
                &b_dir
            } else {
                &a_dir
            };

            let preferred_main = main_image_path(preferred_dir, code);
            let fallback_main = main_image_path(fallback_dir, code);
            let staged_main = staged_pics_dir.join(format!("{code}.jpg"));
            if !copy_if_exists(&preferred_main, &staged_main)? {
                let _ = copy_if_exists(&fallback_main, &staged_main)?;
            }

            let preferred_field = field_image_path(preferred_dir, code);
            let fallback_field = field_image_path(fallback_dir, code);
            let staged_field = staged_field_pics_dir.join(format!("{code}.jpg"));
            if !copy_if_exists(&preferred_field, &staged_field)? && card_has_field_subtype(card) {
                let _ = copy_if_exists(&fallback_field, &staged_field)?;
            }
        }
    }

    if request.include_scripts {
        for card in &merged_cards_list {
            let code = card.code;
            let preferred_side = preferred_side_by_code
                .get(&code)
                .copied()
                .unwrap_or(MergeSide::A);
            let preferred_dir = if preferred_side == MergeSide::A {
                &a_dir
            } else {
                &b_dir
            };
            let fallback_dir = if preferred_side == MergeSide::A {
                &b_dir
            } else {
                &a_dir
            };

            let preferred_script = script_path(preferred_dir, code);
            let fallback_script = script_path(fallback_dir, code);
            let staged_script = staged_script_dir.join(format!("c{code}.lua"));
            if !copy_if_exists(&preferred_script, &staged_script)? {
                let _ = copy_if_exists(&fallback_script, &staged_script)?;
            }
        }
    }

    let output_dir = output_path
        .parent()
        .ok_or_else(|| "Unable to resolve output directory".to_string())?;
    let target_pics_dir = output_dir.join("pics");
    let target_script_dir = output_dir.join("script");
    let backup_cdb_path = output_dir.join(".__dataeditory-merge-backup.cdb");
    let backup_pics_dir = output_dir.join(".__dataeditory-merge-backup-pics");
    let backup_script_dir = output_dir.join(".__dataeditory-merge-backup-script");

    let mut moved_cdb = false;
    let mut moved_pics = false;
    let mut moved_scripts = false;

    let commit_result = (|| -> Result<(), String> {
        if output_path.exists() {
            if backup_cdb_path.exists() {
                fs::remove_file(&backup_cdb_path).map_err(|err| err.to_string())?;
            }
            fs::rename(&output_path, &backup_cdb_path).map_err(|err| err.to_string())?;
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

        fs::rename(&staged_cdb_path, &output_path).map_err(|err| err.to_string())?;
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
            let _ = fs::remove_file(&output_path);
        }
        if backup_cdb_path.exists() {
            let _ = fs::rename(&backup_cdb_path, &output_path);
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

    Ok(())
}
