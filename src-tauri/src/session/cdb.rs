use rand::RngCore;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager};
use ygopro_cdb_encode_rs::YgoProCdb;

pub(crate) struct CdbSessionMeta {
    pub(crate) path: Mutex<String>,
    pub(crate) working_path: PathBuf,
    pub(crate) cdb: Mutex<YgoProCdb>,
    // Rust drops fields in declaration order: close SQLite before removing its file.
    _working_copy: TemporaryCdbFile,
}

impl CdbSessionMeta {
    pub(crate) fn new(path: String, cdb: YgoProCdb, working_copy: TemporaryCdbFile) -> Self {
        Self {
            path: Mutex::new(path),
            working_path: working_copy.0.clone(),
            cdb: Mutex::new(cdb),
            _working_copy: working_copy,
        }
    }
}

pub(crate) struct TemporaryCdbFile(pub(crate) PathBuf);

impl Drop for TemporaryCdbFile {
    fn drop(&mut self) {
        cleanup_temp_path(&self.0);
    }
}

pub struct OpenCdbSessions(pub Mutex<HashMap<String, Arc<CdbSessionMeta>>>);

pub(crate) fn canonicalize_path(path: &str) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .to_string()
}

pub(crate) fn app_temp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|err| err.to_string())?;
    let dir = base.join("cdb-sessions");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

pub(crate) fn build_temp_path_in_dir(base_dir: &Path, tab_id: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(base_dir).map_err(|err| err.to_string())?;

    let mut nonce = [0_u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce);
    Ok(base_dir.join(format!(
        "{}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}.cdb",
        tab_id, nonce[0], nonce[1], nonce[2], nonce[3], nonce[4], nonce[5], nonce[6], nonce[7]
    )))
}

pub(crate) fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown.cdb".to_string())
}

pub(crate) fn cleanup_temp_path(path: &Path) {
    for file in [
        path.to_path_buf(),
        path.with_extension("cdb-journal"),
        path.with_extension("cdb-wal"),
        path.with_extension("cdb-shm"),
    ] {
        if let Err(error) = fs::remove_file(&file) {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!(
                    "Failed to clean up CDB working file {}: {error}",
                    file.display()
                );
            }
        }
    }
}

pub(crate) fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn with_session_meta<T>(
    sessions: &OpenCdbSessions,
    tab_id: &str,
    f: impl FnOnce(&CdbSessionMeta) -> Result<T, String>,
) -> Result<T, String> {
    let session = {
        let sessions = sessions
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        sessions
            .get(tab_id)
            .cloned()
            .ok_or_else(|| format!("Unknown cdb tab: {tab_id}"))?
    };
    f(&session)
}

pub(crate) fn replace_session(
    sessions: &OpenCdbSessions,
    tab_id: String,
    session: CdbSessionMeta,
) -> Result<Option<Arc<CdbSessionMeta>>, String> {
    let mut sessions = sessions
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(sessions.insert(tab_id, Arc::new(session)))
}

pub(crate) fn remove_session(
    sessions: &OpenCdbSessions,
    tab_id: &str,
) -> Result<Option<Arc<CdbSessionMeta>>, String> {
    let mut sessions = sessions
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(sessions.remove(tab_id))
}
