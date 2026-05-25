use std::{
    fs,
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

use super::error::{MediaError, MediaResult};

const MAX_TEXT_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_GENERIC_WRITE_BYTES: usize = 64 * 1024 * 1024;
const LUA_INTEL_RESOURCE_DIR: &str = "lua-intel";
const LUA_INTEL_RESOURCE_FILES: &[&str] =
    &["constant.lua", "def.lua", "_functions.txt", "snippets.json"];

fn ensure_absolute_path(path: &Path, action: &'static str) -> MediaResult<()> {
    if path.as_os_str().is_empty() {
        return Err(MediaError::invalid(format!("{action}: path is empty")));
    }
    if !path.is_absolute() {
        return Err(MediaError::invalid(format!(
            "{action}: path must be absolute"
        )));
    }
    Ok(())
}

fn normalized_extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.trim_start_matches('.').to_ascii_lowercase())
        .filter(|extension| !extension.is_empty())
}

fn ensure_allowed_extension(
    path: &Path,
    allowed_extensions: &[&str],
    action: &'static str,
) -> MediaResult<()> {
    let Some(extension) = normalized_extension(path) else {
        return Err(MediaError::invalid(format!(
            "{action}: file extension is required"
        )));
    };

    if allowed_extensions.contains(&extension.as_str()) {
        return Ok(());
    }

    Err(MediaError::invalid(format!(
        "{action}: unsupported file extension '.{extension}'"
    )))
}

fn ensure_parent_dir(path: &Path, action: &'static str) -> MediaResult<()> {
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Ok(());
    };

    fs::create_dir_all(parent).map_err(|err| MediaError::io_at(action, parent, err))
}

pub fn read_card_image_config_file(path: &Path) -> MediaResult<String> {
    ensure_absolute_path(path, "Failed to read card image config")?;
    ensure_allowed_extension(path, &["json"], "Failed to read card image config")?;
    let metadata = fs::metadata(path)
        .map_err(|err| MediaError::io_at("Failed to read card image config metadata", path, err))?;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(MediaError::invalid(
            "Failed to read card image config: file is too large",
        ));
    }

    fs::read_to_string(path)
        .map_err(|err| MediaError::io_at("Failed to read card image config", path, err))
}

pub fn read_deck_text_file(path: &Path) -> MediaResult<String> {
    ensure_absolute_path(path, "Failed to read deck text")?;
    ensure_allowed_extension(path, &["txt", "ydk"], "Failed to read deck text")?;
    let metadata = fs::metadata(path)
        .map_err(|err| MediaError::io_at("Failed to read deck text metadata", path, err))?;
    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(MediaError::invalid(
            "Failed to read deck text: file is too large",
        ));
    }

    fs::read_to_string(path).map_err(|err| MediaError::io_at("Failed to read deck text", path, err))
}

pub fn write_json_file(path: &Path, content: String) -> MediaResult<()> {
    ensure_absolute_path(path, "Failed to write JSON file")?;
    ensure_allowed_extension(path, &["json"], "Failed to write JSON file")?;
    if content.len() > MAX_TEXT_FILE_BYTES as usize {
        return Err(MediaError::invalid(
            "Failed to write JSON file: file is too large",
        ));
    }

    ensure_parent_dir(path, "Failed to create parent directory for JSON file")?;
    fs::write(path, content)
        .map_err(|err| MediaError::io_at("Failed to write JSON file", path, err))
}

pub fn write_png_file(path: &Path, data: Vec<u8>) -> MediaResult<()> {
    ensure_absolute_path(path, "Failed to write PNG file")?;
    ensure_allowed_extension(path, &["png"], "Failed to write PNG file")?;
    if data.len() > MAX_GENERIC_WRITE_BYTES {
        return Err(MediaError::invalid(
            "Failed to write PNG file: file is too large",
        ));
    }

    ensure_parent_dir(path, "Failed to create parent directory for PNG file")?;
    fs::write(path, data).map_err(|err| MediaError::io_at("Failed to write PNG file", path, err))
}

pub fn save_card_image_jpg_assets(
    cdb_path: String,
    card_code: u32,
    image_data: Vec<u8>,
    field_image_data: Option<Vec<u8>>,
) -> MediaResult<()> {
    if card_code == 0 {
        return Err(MediaError::invalid(
            "Failed to save card image: card code is required",
        ));
    }
    if image_data.len() > MAX_GENERIC_WRITE_BYTES {
        return Err(MediaError::invalid(
            "Failed to save card image: file is too large",
        ));
    }

    let cdb_path = Path::new(&cdb_path);
    ensure_absolute_path(cdb_path, "Failed to save card image")?;
    let Some(cdb_dir) = cdb_path.parent() else {
        return Err(MediaError::invalid(
            "Failed to save card image: invalid CDB path",
        ));
    };

    let pics_dir = cdb_dir.join("pics");
    fs::create_dir_all(&pics_dir)
        .map_err(|err| MediaError::io_at("Failed to create pics directory", &pics_dir, err))?;
    let image_path = pics_dir.join(format!("{card_code}.jpg"));
    fs::write(&image_path, image_data)
        .map_err(|err| MediaError::io_at("Failed to write card image", &image_path, err))?;

    if let Some(field_image_data) = field_image_data {
        if field_image_data.len() > MAX_GENERIC_WRITE_BYTES {
            return Err(MediaError::invalid(
                "Failed to save field image: file is too large",
            ));
        }
        let field_dir = pics_dir.join("field");
        fs::create_dir_all(&field_dir).map_err(|err| {
            MediaError::io_at("Failed to create field image directory", &field_dir, err)
        })?;
        let field_image_path = field_dir.join(format!("{card_code}.jpg"));
        fs::write(&field_image_path, field_image_data).map_err(|err| {
            MediaError::io_at("Failed to write field image", &field_image_path, err)
        })?;
    }

    Ok(())
}

pub fn save_script_image(cdb_path: String, card_code: u32, data: Vec<u8>) -> MediaResult<String> {
    if card_code == 0 {
        return Err(MediaError::invalid(
            "Failed to save script image: card code is required",
        ));
    }
    if data.len() > MAX_GENERIC_WRITE_BYTES {
        return Err(MediaError::invalid(
            "Failed to save script image: file is too large",
        ));
    }

    let cdb_path = Path::new(&cdb_path);
    ensure_absolute_path(cdb_path, "Failed to save script image")?;
    let Some(cdb_dir) = cdb_path.parent() else {
        return Err(MediaError::invalid(
            "Failed to save script image: invalid CDB path",
        ));
    };
    let target = cdb_dir.join(format!("c{card_code}.png"));
    fs::write(&target, data)
        .map_err(|err| MediaError::io_at("Failed to write script image", &target, err))?;
    Ok(target.to_string_lossy().to_string())
}

pub fn load_lua_intel_resource(app: &AppHandle, filename: String) -> MediaResult<String> {
    let filename = filename.trim();
    if !LUA_INTEL_RESOURCE_FILES.contains(&filename) {
        return Err(MediaError::invalid(
            "Failed to load Lua intel resource: unsupported file",
        ));
    }

    for candidate in lua_intel_resource_candidates(app, filename) {
        if candidate.is_file() {
            let metadata = fs::metadata(&candidate).map_err(|err| {
                MediaError::io_at(
                    "Failed to read Lua intel resource metadata",
                    &candidate,
                    err,
                )
            })?;
            if metadata.len() > MAX_TEXT_FILE_BYTES {
                return Err(MediaError::invalid(
                    "Failed to load Lua intel resource: file is too large",
                ));
            }
            return fs::read_to_string(&candidate).map_err(|err| {
                MediaError::io_at("Failed to load Lua intel resource", &candidate, err)
            });
        }
    }

    Err(MediaError::invalid(
        "Failed to load Lua intel resource: file not found",
    ))
}

fn lua_intel_resource_candidates(app: &AppHandle, filename: &str) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(
            resource_dir
                .join("resources")
                .join(LUA_INTEL_RESOURCE_DIR)
                .join(filename),
        );
        candidates.push(resource_dir.join(LUA_INTEL_RESOURCE_DIR).join(filename));
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join(LUA_INTEL_RESOURCE_DIR)
                .join(filename),
        );
        candidates.push(
            current_dir
                .join("resources")
                .join(LUA_INTEL_RESOURCE_DIR)
                .join(filename),
        );
    }
    candidates
}

pub fn path_exists(path: String) -> MediaResult<bool> {
    Ok(Path::new(&path).exists())
}
