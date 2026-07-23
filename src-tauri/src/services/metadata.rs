use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::Utc;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

const WORKSPACE_METADATA_DIR: &str = ".dey";
const WORKSPACE_METADATA_SUFFIX: &str = ".workspace.json";
const WORKSPACE_ASSET_PREFIX: &str = "workspace-asset:";

fn workspace_metadata_path(cdb_path: &str) -> Result<PathBuf, String> {
    let cdb = Path::new(cdb_path);
    let parent = cdb
        .parent()
        .ok_or_else(|| "CDB path has no parent directory".to_string())?;
    let stem = cdb
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "CDB path has no valid file name".to_string())?;

    Ok(parent
        .join(WORKSPACE_METADATA_DIR)
        .join(format!("{stem}{WORKSPACE_METADATA_SUFFIX}")))
}

fn workspace_asset_root(cdb_path: &str) -> Result<PathBuf, String> {
    let cdb = Path::new(cdb_path);
    let parent = cdb
        .parent()
        .ok_or_else(|| "CDB path has no parent directory".to_string())?;
    Ok(parent.join(WORKSPACE_METADATA_DIR))
}

fn decode_image_data_url(value: &str) -> Result<Option<(&'static str, Vec<u8>)>, String> {
    if !value.starts_with("data:image/") {
        return Ok(None);
    }
    let (header, payload) = value
        .split_once(',')
        .ok_or_else(|| "Invalid image data URL".to_string())?;
    if !header
        .split(';')
        .any(|part| part.eq_ignore_ascii_case("base64"))
    {
        return Err("Only base64 image data URLs are supported".to_string());
    }
    let mime = header
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .unwrap_or_default();
    let extension = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        _ => return Err(format!("Unsupported workspace image type: {mime}")),
    };
    let bytes = BASE64
        .decode(payload)
        .map_err(|err| format!("Invalid workspace image data: {err}"))?;
    Ok(Some((extension, bytes)))
}

fn externalize_workspace_images(cdb_path: &str, metadata: &mut Value) -> Result<bool, String> {
    let Some(per_card) = metadata
        .get_mut("image")
        .and_then(|value| value.get_mut("perCard"))
        .and_then(Value::as_object_mut)
    else {
        return Ok(false);
    };
    let asset_root = workspace_asset_root(cdb_path)?;
    let mut changed = false;

    for (card_code, document) in per_card {
        if card_code.parse::<u64>().is_err() {
            continue;
        }
        let Some(form) = document.get_mut("form").and_then(Value::as_object_mut) else {
            continue;
        };
        for (field, file_stem) in [("image", "art"), ("foregroundImage", "foreground")] {
            let Some(value) = form.get(field).and_then(Value::as_str) else {
                continue;
            };
            let Some((extension, bytes)) = decode_image_data_url(value)? else {
                continue;
            };
            let relative = PathBuf::from("card-image")
                .join(card_code)
                .join(format!("{file_stem}.{extension}"));
            let path = asset_root.join(&relative);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            fs::write(path, bytes).map_err(|err| err.to_string())?;
            let reference = format!(
                "{WORKSPACE_ASSET_PREFIX}{}",
                relative.to_string_lossy().replace('\\', "/")
            );
            form.insert(field.to_string(), Value::String(reference));
            changed = true;
        }
    }
    Ok(changed)
}

fn workspace_asset_relative_path(value: &str) -> Option<PathBuf> {
    let relative = value.strip_prefix(WORKSPACE_ASSET_PREFIX)?;
    let parts = relative.split('/').collect::<Vec<_>>();
    if parts.len() != 3
        || parts[0] != "card-image"
        || parts[1].parse::<u64>().is_err()
        || !matches!(
            parts[2],
            "art.png"
                | "art.jpg"
                | "art.webp"
                | "art.gif"
                | "art.bmp"
                | "foreground.png"
                | "foreground.jpg"
                | "foreground.webp"
                | "foreground.gif"
                | "foreground.bmp"
        )
    {
        return None;
    }
    Some(parts.into_iter().collect())
}

fn copy_workspace_image_assets(
    source_cdb_path: &str,
    destination_cdb_path: &str,
    metadata: &Value,
) -> Result<(), String> {
    let Some(per_card) = metadata
        .get("image")
        .and_then(|value| value.get("perCard"))
        .and_then(Value::as_object)
    else {
        return Ok(());
    };
    let source_root = workspace_asset_root(source_cdb_path)?;
    let destination_root = workspace_asset_root(destination_cdb_path)?;
    if source_root == destination_root {
        return Ok(());
    }
    for document in per_card.values() {
        let Some(form) = document.get("form").and_then(Value::as_object) else {
            continue;
        };
        for field in ["image", "foregroundImage"] {
            let Some(relative) = form
                .get(field)
                .and_then(Value::as_str)
                .and_then(workspace_asset_relative_path)
            else {
                continue;
            };
            let source = source_root.join(&relative);
            if !source.is_file() {
                continue;
            }
            let destination = destination_root.join(relative);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            fs::copy(source, destination).map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn prepare_workspace_metadata(cdb_path: &str, metadata: &mut Value) {
    if let Some(object) = metadata.as_object_mut() {
        object.insert("version".to_string(), json!(1));
        object.insert("cdbPath".to_string(), json!(cdb_path));
        object.insert("updatedAt".to_string(), json!(Utc::now().to_rfc3339()));
    }
}

fn write_workspace_metadata(path: &Path, metadata: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let content = serde_json::to_string_pretty(metadata).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

fn empty_workspace_metadata(cdb_path: &str) -> Value {
    json!({
        "version": 1,
        "cdbPath": cdb_path,
        "ui": {},
        "cardGroups": [],
        "image": {},
        "ai": {
            "threads": [],
            "proposals": []
        },
        "scripts": {},
        "tasks": {
            "recent": []
        }
    })
}

pub fn load_workspace_metadata(cdb_path: String) -> Result<Value, String> {
    let path = workspace_metadata_path(&cdb_path)?;
    if !path.exists() {
        return Ok(empty_workspace_metadata(&cdb_path));
    }

    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let mut metadata: Value = serde_json::from_str(&content).map_err(|err| err.to_string())?;
    if externalize_workspace_images(&cdb_path, &mut metadata)? {
        prepare_workspace_metadata(&cdb_path, &mut metadata);
        write_workspace_metadata(&path, &metadata)?;
    }
    Ok(metadata)
}

pub fn save_workspace_metadata(
    cdb_path: String,
    metadata: Value,
    source_cdb_path: Option<String>,
) -> Result<Value, String> {
    let path = workspace_metadata_path(&cdb_path)?;
    if let Some(source) = source_cdb_path
        .as_deref()
        .filter(|source| *source != cdb_path)
    {
        copy_workspace_image_assets(source, &cdb_path, &metadata)?;
    }

    let mut next = metadata;
    externalize_workspace_images(&cdb_path, &mut next)?;
    prepare_workspace_metadata(&cdb_path, &mut next);
    write_workspace_metadata(&path, &next)?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_project_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before UNIX_EPOCH")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dataeditory-metadata-test-{suffix}"));
        fs::create_dir_all(&path).expect("create temp project dir");
        path
    }

    #[test]
    fn missing_metadata_loads_empty_workspace_shape() {
        let dir = temp_project_dir();
        let cdb_path = dir.join("cards.cdb");
        let cdb_path_string = cdb_path.to_string_lossy().to_string();

        let metadata =
            load_workspace_metadata(cdb_path_string.clone()).expect("load empty metadata");

        assert_eq!(metadata["version"], 1);
        assert_eq!(metadata["cdbPath"], cdb_path_string);
        assert!(metadata["ui"].is_object());
        assert!(metadata["cardGroups"].as_array().is_some_and(Vec::is_empty));
        assert!(metadata["ai"]["proposals"]
            .as_array()
            .is_some_and(Vec::is_empty));
        assert!(metadata["ai"].get("pendingProposals").is_none());
        assert!(!dir.join(".dey").exists());

        fs::remove_dir_all(dir).expect("cleanup temp project dir");
    }

    #[test]
    fn save_metadata_writes_dey_file_by_cdb_stem() {
        let dir = temp_project_dir();
        let cdb_path = dir.join("cards.cdb");
        let cdb_path_string = cdb_path.to_string_lossy().to_string();

        let saved = save_workspace_metadata(
            cdb_path_string.clone(),
            json!({
                "ui": {
                    "cardExplorer": {
                        "page": 3
                    }
                },
                "cardGroups": [
                    {
                        "id": "group-1",
                        "name": "Group",
                        "cardIds": [1, 2, 3],
                        "source": "filter"
                    }
                ]
            }),
            None,
        )
        .expect("save metadata");

        let metadata_path = dir.join(".dey").join("cards.workspace.json");
        assert!(metadata_path.exists());
        assert_eq!(saved["version"], 1);
        assert_eq!(saved["cdbPath"], cdb_path_string);
        assert!(saved["updatedAt"].is_string());

        let loaded = load_workspace_metadata(cdb_path.to_string_lossy().to_string())
            .expect("reload metadata");
        assert_eq!(loaded["ui"]["cardExplorer"]["page"], 3);
        assert_eq!(loaded["cardGroups"][0]["id"], "group-1");

        fs::remove_dir_all(dir).expect("cleanup temp project dir");
    }

    #[test]
    fn sibling_cdb_files_use_separate_metadata_files() {
        let dir = temp_project_dir();
        let first = dir.join("cards.cdb").to_string_lossy().to_string();
        let second = dir.join("tokens.cdb").to_string_lossy().to_string();

        save_workspace_metadata(first.clone(), json!({ "ui": { "name": "cards" } }), None)
            .expect("save first metadata");
        save_workspace_metadata(second.clone(), json!({ "ui": { "name": "tokens" } }), None)
            .expect("save second metadata");

        assert_eq!(
            load_workspace_metadata(first).expect("load first")["ui"]["name"],
            "cards"
        );
        assert_eq!(
            load_workspace_metadata(second).expect("load second")["ui"]["name"],
            "tokens"
        );
        assert!(dir.join(".dey").join("cards.workspace.json").exists());
        assert!(dir.join(".dey").join("tokens.workspace.json").exists());

        fs::remove_dir_all(dir).expect("cleanup temp project dir");
    }

    #[test]
    fn embedded_workspace_images_are_externalized_and_copied_on_save_as() {
        let source_dir = temp_project_dir();
        let destination_dir = temp_project_dir();
        let source = source_dir.join("cards.cdb").to_string_lossy().to_string();
        let destination = destination_dir
            .join("copy.cdb")
            .to_string_lossy()
            .to_string();
        let metadata_path = source_dir.join(".dey").join("cards.workspace.json");
        fs::create_dir_all(metadata_path.parent().unwrap()).expect("create metadata dir");
        fs::write(
            &metadata_path,
            serde_json::to_string(&json!({
                "image": {
                    "perCard": {
                        "123": {
                            "form": {
                                "image": format!("data:image/png;base64,{}", BASE64.encode([1u8, 2, 3]))
                            }
                        }
                    }
                }
            }))
            .unwrap(),
        )
        .expect("write legacy metadata");

        let migrated = load_workspace_metadata(source.clone()).expect("migrate metadata");
        assert_eq!(
            migrated["image"]["perCard"]["123"]["form"]["image"],
            "workspace-asset:card-image/123/art.png"
        );
        assert_eq!(
            fs::read(
                source_dir
                    .join(".dey")
                    .join("card-image")
                    .join("123")
                    .join("art.png")
            )
            .unwrap(),
            [1u8, 2, 3]
        );
        assert!(!fs::read_to_string(metadata_path)
            .unwrap()
            .contains("data:image"));

        save_workspace_metadata(destination.clone(), migrated, Some(source))
            .expect("save metadata copy");
        assert_eq!(
            fs::read(
                destination_dir
                    .join(".dey")
                    .join("card-image")
                    .join("123")
                    .join("art.png")
            )
            .unwrap(),
            [1u8, 2, 3]
        );

        fs::remove_dir_all(source_dir).expect("cleanup source temp project dir");
        fs::remove_dir_all(destination_dir).expect("cleanup destination temp project dir");
    }
}
