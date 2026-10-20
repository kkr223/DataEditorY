use std::{fs, io::Write, path::Path};

/// Write a file through a same-directory temporary file and rename, so a crash
/// cannot leave a half-written settings/script/config file behind.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;

    let mut pending = tempfile::NamedTempFile::new_in(parent).map_err(|err| err.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        // Preserve the existing file mode when atomically replacing a file.
        let _ = pending.as_file().set_permissions(metadata.permissions());
    }
    pending.write_all(bytes).map_err(|err| err.to_string())?;
    pending
        .as_file()
        .sync_all()
        .map_err(|err| err.to_string())?;
    pending.persist(path).map_err(|err| err.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_an_existing_file_and_leaves_valid_contents() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("settings.json");
        fs::write(&path, b"old").unwrap();

        write_atomic(&path, b"new").unwrap();

        assert_eq!(fs::read_to_string(path).unwrap(), "new");
    }
}
