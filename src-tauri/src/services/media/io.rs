use std::{fs, path::Path};

use super::error::{MediaError, MediaResult};

fn ensure_parent_dir(path: &Path, action: &'static str) -> MediaResult<()> {
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Ok(());
    };

    fs::create_dir_all(parent).map_err(|err| MediaError::io_at(action, parent, err))
}

pub fn read_cdb(path: String) -> MediaResult<Vec<u8>> {
    fs::read(&path).map_err(|err| MediaError::io_at("Failed to read CDB file", &path, err))
}

pub fn read_text_file(path: String) -> MediaResult<String> {
    fs::read_to_string(&path)
        .map_err(|err| MediaError::io_at("Failed to read text file", &path, err))
}

pub fn write_cdb(path: String, data: Vec<u8>) -> MediaResult<()> {
    let target = Path::new(&path);
    ensure_parent_dir(target, "Failed to create parent directory for CDB file")?;
    fs::write(target, data)
        .map_err(|err| MediaError::io_at("Failed to write CDB file", target, err))
}

pub fn write_file(path: String, data: Vec<u8>) -> MediaResult<()> {
    let target = Path::new(&path);
    ensure_parent_dir(target, "Failed to create parent directory for file")?;
    fs::write(target, data).map_err(|err| MediaError::io_at("Failed to write file", target, err))
}

pub fn path_exists(path: String) -> MediaResult<bool> {
    Ok(Path::new(&path).exists())
}
