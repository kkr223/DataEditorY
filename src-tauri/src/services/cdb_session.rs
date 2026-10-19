use std::{collections::HashMap, fs, path::Path};

use tauri::AppHandle;
use ygopro_cdb_encode_rs::YgoProCdb;

use crate::{
    models::cdb::{CardDto, OpenCdbTabResponse},
    repository::cdb as cdb_repository,
    session::cdb::{
        app_temp_dir, basename, build_temp_path_in_dir, canonicalize_path, ensure_parent_dir,
        remove_session, replace_session, with_session_meta, CdbSessionMeta, OpenCdbSessions,
        TemporaryCdbFile,
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

pub fn close_cdb_tab(sessions: &OpenCdbSessions, tab_id: String) -> Result<(), String> {
    // Existing queries own the session until they finish; the last owner cleans up.
    drop(remove_session(sessions, &tab_id)?);
    Ok(())
}

pub fn save_cdb_tab_to(
    sessions: &OpenCdbSessions,
    tab_id: String,
    destination: Option<String>,
) -> Result<String, String> {
    with_session_meta(sessions, &tab_id, |session| {
        // Only this session is locked during database access and disk I/O.
        let _cdb_guard = session
            .cdb
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut source_path = session
            .path
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let target = destination
            .or_else(|| Some(source_path.clone()))
            .filter(|path| !path.trim().is_empty())
            .ok_or_else(|| "A destination path is required for this document".to_string())?;

        let target_path = Path::new(&target);
        ensure_parent_dir(target_path)?;
        let parent = target_path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let staged = TemporaryCdbFile(build_temp_path_in_dir(parent, ".dataeditory-save")?);
        fs::copy(&session.working_path, &staged.0).map_err(|err| err.to_string())?;
        fs::rename(&staged.0, target_path).map_err(|err| err.to_string())?;
        *source_path = canonicalize_path(&target);
        Ok(target)
    })
}

pub fn create_unsaved_cdb_tab(
    app: &AppHandle,
    sessions: &OpenCdbSessions,
    tab_id: String,
    initial_cards: Vec<CardDto>,
) -> Result<OpenCdbTabResponse, String> {
    let session_dir = app_temp_dir(app)?;
    create_unsaved_cdb_tab_in_dir(sessions, &session_dir, tab_id, initial_cards)
}

fn create_unsaved_cdb_tab_in_dir(
    sessions: &OpenCdbSessions,
    session_dir: &Path,
    tab_id: String,
    initial_cards: Vec<CardDto>,
) -> Result<OpenCdbTabResponse, String> {
    let temp_path = build_temp_path_in_dir(&session_dir, &tab_id)?;
    let working_copy = TemporaryCdbFile(temp_path.clone());
    ensure_parent_dir(&temp_path)?;
    let mut cdb = cdb_repository::create_cdb(&temp_path)?;
    if !initial_cards.is_empty() {
        cdb.add_cards(&initial_cards)
            .map_err(|err| err.to_string())?;
    }
    let cached_total = initial_cards.len() as u32;
    register_session(
        sessions,
        tab_id,
        CdbSessionMeta::new(String::new(), cdb, working_copy),
    )?;
    Ok(OpenCdbTabResponse {
        name: "Untitled.cdb".to_string(),
        cached_cards: initial_cards.into_iter().take(50).collect(),
        cached_total,
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
    let working_copy = TemporaryCdbFile(temp_path.clone());
    ensure_parent_dir(&temp_path)?;
    fs::copy(&original_path, &temp_path).map_err(|err| err.to_string())?;

    let cdb = cdb_repository::open_cdb(&temp_path)?;
    let response = build_open_response(&original_path, &cdb)?;
    register_session(
        sessions,
        tab_id,
        CdbSessionMeta::new(original_path, cdb, working_copy),
    )?;

    Ok(response)
}

fn build_open_response(original_path: &str, cdb: &YgoProCdb) -> Result<OpenCdbTabResponse, String> {
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
    drop(replace_session(sessions, tab_id, session)?);
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
            assert_eq!(
                Path::new(&*session.path.lock().unwrap()),
                expected.as_path()
            );
            assert!(session.working_path.is_file());
            Ok(())
        })
        .unwrap();

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn creates_unsaved_cdb_with_initial_cards() {
        let root = make_temp_dir("create-initial");
        let sessions = make_sessions();

        let response = create_unsaved_cdb_tab_in_dir(
            &sessions,
            &root,
            "tab-create".to_string(),
            vec![sample_card(100, "Alpha")],
        )
        .unwrap();

        assert_eq!(response.cached_total, 1);
        assert_eq!(response.cached_cards[0].code, 100);
        with_session_meta(&sessions, "tab-create", |session| {
            let cards = cdb_repository::load_all_cards_from_path(&session.working_path)?;
            assert_eq!(cards.len(), 1);
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

        save_cdb_tab_to(&sessions, "tab-save".to_string(), None).unwrap();

        let cards = cdb_repository::load_all_cards_from_path(&source_path).unwrap();
        assert_eq!(cards.len(), 2);
        assert!(cards.iter().any(|card| card.code == 200));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn opens_a_new_card_with_zero_type_into_the_initial_search_page() {
        let root = make_temp_dir("open-zero-type");
        let session_dir = root.join("sessions");
        let source_path = root.join("cards.cdb");
        let card = CardDto {
            type_: 0,
            ..sample_card(1001, "Draft card")
        };
        cdb_repository::recreate_cdb_with_cards(&source_path, &[card]).unwrap();
        let sessions = make_sessions();

        let response = open_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-open-zero-type".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(response.cached_total, 1);
        assert_eq!(response.cached_cards.len(), 1);
        assert_eq!(response.cached_cards[0].code, 1001);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn save_as_updates_session_path_without_overwriting_original() {
        let root = make_temp_dir("save-as");
        let session_dir = root.join("sessions");
        let source_path = root.join("cards.cdb");
        let destination_path = root.join("cards-copy.cdb");
        cdb_repository::recreate_cdb_with_cards(&source_path, &[sample_card(100, "Alpha")])
            .unwrap();
        let sessions = make_sessions();

        open_cdb_tab_in_dir(
            &sessions,
            &session_dir,
            "tab-save-as".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap();

        with_session_meta(&sessions, "tab-save-as", |session| {
            let mut cdb = session
                .cdb
                .lock()
                .map_err(|_| "Failed to acquire CDB lock".to_string())?;
            cdb.add_cards(&[sample_card(200, "Beta")])
                .map_err(|err| err.to_string())?;
            Ok(())
        })
        .unwrap();

        let saved_path = save_cdb_tab_to(
            &sessions,
            "tab-save-as".to_string(),
            Some(destination_path.to_string_lossy().to_string()),
        )
        .unwrap();

        assert_eq!(
            canonicalize_path(&saved_path),
            canonicalize_path(&destination_path.to_string_lossy())
        );
        let original_cards = cdb_repository::load_all_cards_from_path(&source_path).unwrap();
        let copied_cards = cdb_repository::load_all_cards_from_path(&destination_path).unwrap();
        assert_eq!(original_cards.len(), 1);
        assert_eq!(copied_cards.len(), 2);
        with_session_meta(&sessions, "tab-save-as", |session| {
            assert_eq!(
                *session.path.lock().unwrap(),
                canonicalize_path(&destination_path.to_string_lossy())
            );
            Ok(())
        })
        .unwrap();

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

    #[test]
    fn close_defers_file_cleanup_until_the_last_query_releases_its_session() {
        let root = make_temp_dir("close-inflight");
        let sessions = make_sessions();
        create_unsaved_cdb_tab_in_dir(&sessions, &root, "A".into(), vec![]).unwrap();
        let held = sessions.0.lock().unwrap().get("A").unwrap().clone();
        let working_path = held.working_path.clone();
        close_cdb_tab(&sessions, "A".into()).unwrap();
        assert!(with_session_meta(&sessions, "A", |_| Ok(())).is_err());
        assert!(working_path.exists());
        assert!(held.cdb.lock().unwrap().find_all().is_ok());
        drop(held);
        assert!(!working_path.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_open_cleans_the_partially_created_working_copy() {
        let root = make_temp_dir("invalid-open");
        let source = root.join("invalid.cdb");
        fs::write(&source, b"not a database").unwrap();
        let session_dir = root.join("sessions");
        assert!(open_cdb_tab_in_dir(
            &make_sessions(),
            &session_dir,
            "A".into(),
            source.to_string_lossy().into_owned()
        )
        .is_err());
        assert_eq!(fs::read_dir(session_dir).unwrap().count(), 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replacing_a_session_releases_its_old_working_copy() {
        let root = make_temp_dir("replace");
        let sessions = make_sessions();
        create_unsaved_cdb_tab_in_dir(&sessions, &root, "A".into(), vec![]).unwrap();
        let old_path = with_session_meta(&sessions, "A", |s| Ok(s.working_path.clone())).unwrap();
        create_unsaved_cdb_tab_in_dir(&sessions, &root, "A".into(), vec![]).unwrap();
        assert!(!old_path.exists());
        close_cdb_tab(&sessions, "A".into()).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn waiting_for_a_database_during_save_does_not_hold_the_session_map() {
        use std::{
            sync::Arc,
            thread,
            time::{Duration, Instant},
        };
        let root = make_temp_dir("save-lock-scope");
        let sessions = Arc::new(make_sessions());
        create_unsaved_cdb_tab_in_dir(&sessions, &root, "A".into(), vec![]).unwrap();
        let held = sessions.0.lock().unwrap().get("A").unwrap().clone();
        let connection = held.cdb.lock().unwrap();
        let worker_sessions = sessions.clone();
        let target = root.join("saved.cdb").to_string_lossy().into_owned();
        let saving =
            thread::spawn(move || save_cdb_tab_to(&worker_sessions, "A".into(), Some(target)));
        let deadline = Instant::now() + Duration::from_secs(2);
        while Arc::strong_count(&held) < 3 && Instant::now() < deadline {
            thread::yield_now();
        }
        let acquired_session = Arc::strong_count(&held) >= 3;
        let mut map_available = false;
        while Instant::now() < deadline {
            if sessions.0.try_lock().is_ok() {
                map_available = true;
                break;
            }
            thread::yield_now();
        }
        drop(connection);
        saving.join().unwrap().unwrap();
        assert!(acquired_session && map_available);
        drop(held);
        close_cdb_tab(&sessions, "A".into()).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
