use std::fs;

use crate::{build_card_script_path, normalize_script_content, CardScriptDocument, CardScriptInfo};

pub fn get_card_script_info(cdb_path: String, card_id: u32) -> Result<CardScriptInfo, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    Ok(CardScriptInfo {
        path: script_path.to_string_lossy().to_string(),
        exists: script_path.exists(),
    })
}

pub fn read_card_script(cdb_path: String, card_id: u32) -> Result<CardScriptDocument, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    if !script_path.exists() {
        return Ok(CardScriptDocument {
            path: script_path.to_string_lossy().to_string(),
            exists: false,
            content: String::new(),
        });
    }

    let content = fs::read_to_string(&script_path).map_err(|err| err.to_string())?;
    Ok(CardScriptDocument {
        path: script_path.to_string_lossy().to_string(),
        exists: true,
        content: normalize_script_content(content),
    })
}

pub fn write_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
    overwrite: bool,
) -> Result<CardScriptInfo, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    if script_path.exists() && !overwrite {
        return Err("Script already exists".to_string());
    }

    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(&script_path, normalize_script_content(content)).map_err(|err| err.to_string())?;
    Ok(CardScriptInfo {
        path: script_path.to_string_lossy().to_string(),
        exists: true,
    })
}

pub fn save_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
) -> Result<CardScriptInfo, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(&script_path, normalize_script_content(content)).map_err(|err| err.to_string())?;
    Ok(CardScriptInfo {
        path: script_path.to_string_lossy().to_string(),
        exists: true,
    })
}
