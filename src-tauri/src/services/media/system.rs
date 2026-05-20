use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use super::error::{MediaError, MediaResult};

fn vscode_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("code")];

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            Path::new(&local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        candidates.push(
            Path::new(&program_files)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            Path::new(&program_files_x86)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    candidates
}

fn open_with_preferred_editor(path: &Path) -> MediaResult<()> {
    for candidate in vscode_candidates() {
        let mut command = Command::new(&candidate);
        if command.arg("-g").arg(path).spawn().is_ok() {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in system editor", path, err))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in system editor", path, err))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in system editor", path, err))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(MediaError::UnsupportedPlatform)
}

pub fn open_in_system_editor(path: String) -> MediaResult<()> {
    open_with_preferred_editor(Path::new(&path))
}

pub fn open_in_default_app(path: String) -> MediaResult<()> {
    let target = Path::new(&path);

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(target.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in default app", target, err))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in default app", target, err))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(target.as_os_str())
            .spawn()
            .map_err(|err| MediaError::io_at("Failed to open path in default app", target, err))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err(MediaError::UnsupportedPlatform)
}

pub(crate) fn normalize_cdb_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    if !extension.eq_ignore_ascii_case("cdb") || !path.is_file() {
        return None;
    }

    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Some(resolved.to_string_lossy().to_string())
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::new();
    for path in paths {
        if !deduped.contains(&path) {
            deduped.push(path);
        }
    }
    deduped
}

pub(crate) fn collect_cdb_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    dedupe_paths(
        args.into_iter()
            .filter_map(|arg| {
                let value: std::ffi::OsString = arg.into();
                normalize_cdb_path(Path::new(&value))
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_helpers::make_temp_dir;

    #[test]
    fn collects_existing_cdb_paths_from_args() {
        let root = make_temp_dir("collect-cdb");
        let first = root.join("cards-a.cdb");
        let second = root.join("cards-b.CDB");
        let ignored = root.join("notes.txt");
        fs::write(&first, []).unwrap();
        fs::write(&second, []).unwrap();
        fs::write(&ignored, []).unwrap();

        let collected = collect_cdb_paths_from_args(vec![
            first.as_os_str().to_os_string(),
            second.as_os_str().to_os_string(),
            ignored.as_os_str().to_os_string(),
            first.as_os_str().to_os_string(),
        ]);

        assert_eq!(collected.len(), 2);
        assert!(collected.iter().any(|path| path.ends_with("cards-a.cdb")));
        assert!(collected
            .iter()
            .any(|path| path.to_ascii_lowercase().ends_with("cards-b.cdb")));

        let _ = fs::remove_dir_all(&root);
    }
}
