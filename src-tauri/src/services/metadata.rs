use chrono::Utc;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

const WORKSPACE_METADATA_DIR: &str = ".dey";
const WORKSPACE_METADATA_SUFFIX: &str = ".workspace.json";

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
    serde_json::from_str(&content).map_err(|err| err.to_string())
}

pub fn save_workspace_metadata(cdb_path: String, metadata: Value) -> Result<Value, String> {
    let path = workspace_metadata_path(&cdb_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let mut next = metadata;
    if let Some(object) = next.as_object_mut() {
        object.insert("version".to_string(), json!(1));
        object.insert("cdbPath".to_string(), json!(cdb_path));
        object.insert("updatedAt".to_string(), json!(Utc::now().to_rfc3339()));
    }

    let content = serde_json::to_string_pretty(&next).map_err(|err| err.to_string())?;
    fs::write(&path, content).map_err(|err| err.to_string())?;
    Ok(next)
}

pub fn backup_workspace_metadata(cdb_path: String) -> Result<Option<String>, String> {
    let path = workspace_metadata_path(&cdb_path)?;
    if !path.exists() {
        return Ok(None);
    }

    let timestamp = Utc::now().format("%Y%m%d%H%M%S");
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Workspace metadata path has no valid file name".to_string())?;
    let backup_path = path.with_file_name(format!("{file_name}.{timestamp}.bak"));
    fs::copy(&path, &backup_path).map_err(|err| err.to_string())?;
    Ok(Some(backup_path.to_string_lossy().to_string()))
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

        save_workspace_metadata(first.clone(), json!({ "ui": { "name": "cards" } }))
            .expect("save first metadata");
        save_workspace_metadata(second.clone(), json!({ "ui": { "name": "tokens" } }))
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
}
