use std::path::Path;

use crate::{
    models::cdb::{
        CardDto, CreateCdbFromCardsRequest, DeleteCardsRequest, ModifyCardsRequest,
        QueryCardsRequest, SearchCardsPageRequest, SearchCardsPageResponse,
        UndoModifyOperationRequest,
    },
    repository::cdb as cdb_repository,
    session::cdb::{with_session_meta, OpenCdbSessions},
};

const PAGE_SIZE_DEFAULT: u32 = 50;
const PAGE_SIZE_MAX: u32 = 200;

pub fn search_cards_page(
    sessions: &OpenCdbSessions,
    request: SearchCardsPageRequest,
) -> Result<SearchCardsPageResponse, String> {
    with_session_meta(sessions, &request.tab_id, |session| {
        let conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        let page = request.page.unwrap_or(1).max(1);
        let page_size = request
            .page_size
            .unwrap_or(PAGE_SIZE_DEFAULT)
            .clamp(1, PAGE_SIZE_MAX);
        let offset = (page - 1) * page_size;
        let where_clause = if request.where_clause.trim().is_empty() {
            "1=1".to_string()
        } else {
            request.where_clause.trim().to_string()
        };
        let total = cdb_repository::count_cards(&conn, &request.where_clause, &request.params)?;
        let cards = cdb_repository::query_cards(
            &conn,
            &format!(
                "{} ORDER BY datas.id LIMIT {} OFFSET {}",
                where_clause, page_size, offset
            ),
            &request.params,
        )?;
        Ok(SearchCardsPageResponse { cards, total })
    })
}

pub fn query_cards_raw(
    sessions: &OpenCdbSessions,
    request: QueryCardsRequest,
) -> Result<Vec<CardDto>, String> {
    with_session_meta(sessions, &request.tab_id, |session| {
        let conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        cdb_repository::query_cards(&conn, &request.query_clause, &request.params)
    })
}

pub fn get_card_by_id(
    sessions: &OpenCdbSessions,
    tab_id: String,
    card_id: u32,
) -> Result<Option<CardDto>, String> {
    with_session_meta(sessions, &tab_id, |session| {
        let conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        cdb_repository::get_card(&conn, card_id)
    })
}

pub fn modify_cards(sessions: &OpenCdbSessions, request: ModifyCardsRequest) -> Result<(), String> {
    with_session_meta(sessions, &request.tab_id, |session| {
        let mut conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        cdb_repository::upsert_cards(&mut conn, &request.cards)
    })
}

pub fn delete_cards(sessions: &OpenCdbSessions, request: DeleteCardsRequest) -> Result<(), String> {
    with_session_meta(sessions, &request.tab_id, |session| {
        let mut conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        cdb_repository::delete_cards_by_id(&mut conn, &request.card_ids)
    })
}

pub fn create_cdb_from_cards(request: CreateCdbFromCardsRequest) -> Result<(), String> {
    cdb_repository::recreate_cdb_with_cards(Path::new(&request.output_path), &request.cards)
}

pub fn undo_modify_operation(
    sessions: &OpenCdbSessions,
    request: UndoModifyOperationRequest,
) -> Result<(), String> {
    with_session_meta(sessions, &request.tab_id, |session| {
        let mut conn = session
            .conn
            .lock()
            .map_err(|_| "Failed to acquire connection lock".to_string())?;
        cdb_repository::undo_modify_operation(
            &mut conn,
            &request.cards_to_restore,
            &request.ids_to_delete,
        )
    })
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashMap,
        fs,
        path::PathBuf,
        sync::Mutex,
        time::{SystemTime, UNIX_EPOCH},
    };

    use serde_json::json;

    use super::*;
    use crate::{
        models::cdb::{CardDto, OpenCdbTabResponse},
        services::cdb_session::open_cdb_tab_in_dir,
        session::cdb::OpenCdbSessions,
    };

    fn make_temp_dir(label: &str) -> PathBuf {
        let unique = format!(
            "dataeditory-cdb-cards-{label}-{}-{}",
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
            attack: code as i32,
            defense: 1000,
            level: 4,
            race: 1,
            attribute: 1,
            category: 0,
            ot: 0,
            name: name.to_string(),
            desc: format!("Desc {code}"),
            strings: vec![String::new(); 16],
            lscale: 0,
            rscale: 0,
            link_marker: 0,
            rule_code: 0,
        }
    }

    fn open_test_session(
        root: &Path,
        sessions: &OpenCdbSessions,
        tab_id: &str,
        cards: &[CardDto],
    ) -> OpenCdbTabResponse {
        let source_path = root.join(format!("{tab_id}.cdb"));
        let session_dir = root.join("sessions");
        cdb_repository::recreate_cdb_with_cards(&source_path, cards).unwrap();
        open_cdb_tab_in_dir(
            sessions,
            &session_dir,
            tab_id.to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .unwrap()
    }

    #[test]
    fn paginates_cards_for_an_open_session() {
        let root = make_temp_dir("search");
        let sessions = make_sessions();
        let cards = vec![
            sample_card(100, "Alpha"),
            sample_card(200, "Beta"),
            sample_card(300, "Gamma"),
        ];
        open_test_session(&root, &sessions, "tab-search", &cards);

        let response = search_cards_page(
            &sessions,
            SearchCardsPageRequest {
                tab_id: "tab-search".to_string(),
                where_clause: "texts.name LIKE :keyword".to_string(),
                params: HashMap::from([("keyword".to_string(), json!("%a%"))]),
                page: Some(2),
                page_size: Some(1),
            },
        )
        .unwrap();

        assert_eq!(response.total, 3);
        assert_eq!(response.cards.len(), 1);
        assert_eq!(response.cards[0].code, 200);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn modifies_and_deletes_cards_in_the_working_copy() {
        let root = make_temp_dir("modify-delete");
        let sessions = make_sessions();
        let cards = vec![sample_card(100, "Alpha"), sample_card(200, "Beta")];
        open_test_session(&root, &sessions, "tab-edit", &cards);

        modify_cards(
            &sessions,
            ModifyCardsRequest {
                tab_id: "tab-edit".to_string(),
                cards: vec![sample_card(300, "Gamma")],
            },
        )
        .unwrap();

        let after_modify = query_cards_raw(
            &sessions,
            QueryCardsRequest {
                tab_id: "tab-edit".to_string(),
                query_clause: "1=1 ORDER BY datas.id".to_string(),
                params: HashMap::new(),
            },
        )
        .unwrap();
        assert_eq!(after_modify.len(), 3);

        delete_cards(
            &sessions,
            DeleteCardsRequest {
                tab_id: "tab-edit".to_string(),
                card_ids: vec![100],
            },
        )
        .unwrap();

        let deleted = get_card_by_id(&sessions, "tab-edit".to_string(), 100).unwrap();
        assert!(deleted.is_none());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn recreates_cdb_from_cards_for_export() {
        let root = make_temp_dir("export");
        let output_path = root.join("exported.cdb");

        create_cdb_from_cards(CreateCdbFromCardsRequest {
            output_path: output_path.to_string_lossy().to_string(),
            cards: vec![sample_card(700, "Exported")],
        })
        .unwrap();

        let cards = cdb_repository::load_all_cards_from_path(&output_path).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].code, 700);

        let _ = fs::remove_dir_all(&root);
    }
}
