use std::{collections::HashMap, fs, path::Path, sync::{Arc, Mutex}};

use tauri::AppHandle;
use ygopro_cdb_encode_rs::YgoProCdb;

use crate::{
    models::cdb::OpenCdbTabResponse,
    repository::cdb as cdb_repository,
    session::cdb::{
        app_temp_dir, basename, build_temp_path_in_dir, canonicalize_path, cleanup_temp_path,
        ensure_parent_dir, remove_session, replace_session, with_session_meta, CdbSessionMeta,
        OpenCdbSessions,
    },
};

pub fn open_cdb_tab(
    app: &AppHandle,
    sessions: &OpenCdbSessions,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let session_dir = app_temp_dir(app)?;
    open_cdb_tab_in_dir(sessions, &session_dir, tab_id, path)
}

pub fn create_cdb_tab(
    app: &AppHandle,
    sessions: &OpenCdbSessions,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let session_dir = app_temp_dir(app)?;
    create_cdb_tab_in_dir(sessions, &session_dir, tab_id, path)
}

pub fn close_cdb_tab(sessions: &OpenCdbSessions, tab_id: String) -> Result<(), String> {
    if let Some(session) = remove_session(sessions, &tab_id)? {
        // Drop the CDB instance before deleting the file — on Windows the
        // SQLite connection holds a file lock that prevents deletion.
        drop(session.cdb);
        cleanup_temp_path(&session.working_path);
    }
    Ok(())
}

pub fn save_cdb_tab(sessions: &OpenCdbSessions, tab_id: String) -> Result<(), String> {
    with_session_meta(sessions, &tab_id, |session| {
        let target_path = Path::new(&session.path);
        ensure_parent_dir(target_path)?;
        // Lock the CDB to ensure no write transaction is in flight
        let _cdb_guard = session
            .cdb
            .lock()
            .map_err(|_| "Failed to acquire CDB lock".to_string())?;
        fs::copy(&session.working_path, target_path).map_err(|err| err.to_string())?;
        Ok(())
    })
}

pub(crate) fn open_cdb_tab_in_dir(
    sessions: &OpenCdbSessions,
    session_dir: &Path,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let original_path = canonicalize_path(&path);
    let temp_path = build_temp_path_in_dir(session_dir, &tab_id)?;
    ensure_parent_dir(&temp_path)?;
    fs::copy(&original_path, &temp_path).map_err(|err| err.to_string())?;

    let cdb = cdb_repository::open_cdb(&temp_path)?;
    let response = build_open_response(&original_path, &cdb)?;
    register_session(
        sessions,
        tab_id,
        CdbSessionMeta {
            path: original_path,
            working_path: temp_path,
            cdb: Arc::new(Mutex::new(cdb)),
        },
    )?;

    Ok(response)
}

pub(crate) fn create_cdb_tab_in_dir(
    sessions: &OpenCdbSessions,
    session_dir: &Path,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let original_path = Path::new(path.trim()).to_path_buf();
    ensure_parent_dir(&original_path)?;

    let temp_path = build_temp_path_in_dir(session_dir, &tab_id)?;
    ensure_parent_dir(&temp_path)?;

    let cdb = cdb_repository::create_cdb(&temp_path)?;

    fs::copy(&temp_path, &original_path).map_err(|err| err.to_string())?;

    register_session(
        sessions,
        tab_id,
        CdbSessionMeta {
            path: original_path.to_string_lossy().to_string(),
            working_path: temp_path,
            cdb: Arc::new(Mutex::new(cdb)),
        },
    )?;

    Ok(OpenCdbTabResponse {
        name: basename(original_path.to_string_lossy().as_ref()),
        cached_cards: Vec::new(),
        cached_total: 0,
    })
}

fn build_open_response(
    original_path: &str,
    cdb: &YgoProCdb,
) -> Result<OpenCdbTabResponse, String> {
    let (cached_cards, cached_total) = cdb
        .query_raw_page("1=1", &HashMap::new(), 1, 50)
        .map_err(|err| err.to_string())?;
    Ok(OpenCdbTabResponse {
        name: basename(original_path),
        cached_cards,
        cached_total,
    })
}

fn register_session(
    sessions: &OpenCdbSessions,
    tab_id: String,
    session: CdbSessionMeta,
) -> Result<(), String> {
    if let Some(previous) = replace_session(sessions, tab_id, session)? {
        cleanup_temp_path(&previous.working_path);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        sync::Mutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::models::cdb::CardDto;

    fn make_temp_dir(label: &str) -> PathBuf {
        let unique = format!(
            "dataeditory-cdb-session-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn make_sessions() -> OpenCdbSessions {
        OpenCdbSessions(Mutex::new(HashMap::new()))
    }

    fn sample_card(code: u32, name: &str) -> CardDto {
        CardDto {
            code,
            alias: 0,
            setcode: Vec::new(),
            type_: 0x1,
            attack: 1000,
            defense: 1000,
            level: 4,
            race: 1,
            attribute: 1,
            category: 0,
            ot: 0,
            name: name.to_string(),
            desc: String::new(),
            strings: vec![String::new(); 16],
            lscale: 0,
            rscale: 0,
            link_marker: 0,
            rule_code: 0,
        }
    }

    #[test]
    fn opens_existing_cdb_into_registered_session() {
        let root = make_temp_dir("open");
        let session_dir = root.join("sessions");
        let source_path = root.join("cards.cdb");
        cdb_repository::recreate_cdb_with_cards(&source_path, &[sample_card(100, "Alpha")])
            .unwrap();
        let sessions = make_sessions();

        let response = open_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-open".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(response.name, "cards.cdb");
        assert_eq!(response.cached_total, 1);
        assert_eq!(response.cached_cards.len(), 1);
        assert_eq!(response.cached_cards[0].code, 100);

        with_session_meta(&sessions, "tab-open", |session| {
            let expected = std::fs::canonicalize(&source_path).unwrap();
            assert_eq!(Path::new(&session.path), expected.as_path());
            assert!(session.working_path.is_file());
            Ok(())
        })
        .unwrap();

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn creates_new_cdb_and_persists_original_file() {
        let root = make_temp_dir("create");
        let session_dir = root.join("sessions");
        let source_path = root.join("workspace").join("fresh.cdb");
        let sessions = make_sessions();

        let response = create_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-create".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(response.name, "fresh.cdb");
        assert_eq!(response.cached_total, 0);
        assert!(source_path.is_file());

        let cards = cdb_repository::load_all_cards_from_path(&source_path).unwrap();
        assert!(cards.is_empty());

        with_session_meta(&sessions, "tab-create", |session| {
            assert!(session.working_path.is_file());
            Ok(())
        })
        .unwrap();

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn saves_working_copy_back_to_original_path() {
        let root = make_temp_dir("save");
        let session_dir = root.join("sessions");
        let source_path = root.join("cards.cdb");
        cdb_repository::recreate_cdb_with_cards(&source_path, &[sample_card(100, "Alpha")])
            .unwrap();
        let sessions = make_sessions();

        open_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-save".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        with_session_meta(&sessions, "tab-save", |session| {
            let mut cdb = session
                .cdb
                .lock()
                .map_err(|_| "Failed to acquire CDB lock".to_string())?;
            cdb.add_cards(&[sample_card(200, "Beta")])
                .map_err(|err| err.to_string())?;
            Ok(())
        })
        .unwrap();

        save_cdb_tab(&sessions, "tab-save".to_string()).unwrap();

        let cards = cdb_repository::load_all_cards_from_path(&source_path).unwrap();
        assert_eq!(cards.len(), 2);
        assert!(cards.iter().any(|card| card.code == 200));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn closes_session_and_cleans_temp_copy() {
        let root = make_temp_dir("close");
        let session_dir = root.join("sessions");
        let source_path = root.join("cards.cdb");
        cdb_repository::recreate_cdb_with_cards(&source_path, &[sample_card(100, "Alpha")])
            .unwrap();
        let sessions = make_sessions();

        open_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-close".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        let working_path = with_session_meta(&sessions, "tab-close", |session| {
            Ok(session.working_path.clone())
        })
        .unwrap();
        assert!(working_path.is_file());

        close_cdb_tab(&sessions, "tab-close".to_string()).unwrap();

        assert!(!working_path.exists());
        assert!(with_session_meta(&sessions, "tab-close", |_| Ok(())).is_err());

        let _ = fs::remove_dir_all(&root);
    }
}
