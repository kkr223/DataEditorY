use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use super::error::{MediaError, MediaResult};
use crate::ExternalOpenPaths;

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

pub(crate) fn normalize_external_text_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    if !matches!(extension.as_str(), "lua" | "txt" | "conf") || !path.is_file() {
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

#[cfg(test)]
pub(crate) fn collect_cdb_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    collect_external_open_paths_from_args(args).cdb_paths
}

pub(crate) fn collect_external_open_paths_from_args<I>(args: I) -> ExternalOpenPaths
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    let mut cdb_paths = Vec::new();
    let mut text_paths = Vec::new();

    for arg in args {
        let value: std::ffi::OsString = arg.into();
        let path = Path::new(&value);
        if let Some(cdb_path) = normalize_cdb_path(path) {
            cdb_paths.push(cdb_path);
            continue;
        }
        if let Some(text_path) = normalize_external_text_path(path) {
            text_paths.push(text_path);
        }
    }

    ExternalOpenPaths {
        cdb_paths: dedupe_paths(cdb_paths),
        text_paths: dedupe_paths(text_paths),
    }
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

    #[test]
    fn collects_external_open_paths_from_args() {
        let root = make_temp_dir("collect-external-open");
        let cdb = root.join("cards.cdb");
        let lua = root.join("script.lua");
        let txt = root.join("notes.TXT");
        let conf = root.join("strings.conf");
        let ignored = root.join("image.png");
        fs::write(&cdb, []).unwrap();
        fs::write(&lua, []).unwrap();
        fs::write(&txt, []).unwrap();
        fs::write(&conf, []).unwrap();
        fs::write(&ignored, []).unwrap();

        let collected = collect_external_open_paths_from_args(vec![
            cdb.as_os_str().to_os_string(),
            lua.as_os_str().to_os_string(),
            txt.as_os_str().to_os_string(),
            conf.as_os_str().to_os_string(),
            ignored.as_os_str().to_os_string(),
            lua.as_os_str().to_os_string(),
        ]);

        assert_eq!(collected.cdb_paths.len(), 1);
        assert_eq!(collected.text_paths.len(), 3);
        assert!(collected.cdb_paths[0].ends_with("cards.cdb"));
        assert!(collected.text_paths.iter().any(|path| path.ends_with("script.lua")));
        assert!(collected
            .text_paths
            .iter()
            .any(|path| path.to_ascii_lowercase().ends_with("notes.txt")));
        assert!(collected.text_paths.iter().any(|path| path.ends_with("strings.conf")));

        let _ = fs::remove_dir_all(&root);
    }
}
