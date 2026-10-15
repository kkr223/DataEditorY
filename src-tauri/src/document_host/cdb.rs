use std::{
    collections::{HashMap, VecDeque},
    sync::Mutex,
};

use serde_json::{json, to_value, Value};

use crate::{
    models::cdb::CardDto,
    services::{assets::CardAssetIdChange, cdb_cards, cdb_session},
    session::cdb::{with_session_meta, OpenCdbSessions},
};

use super::{
    models::{CardCollectionCommand, CardCollectionQuery, CardSearchPage, ProviderCommandResult},
    search::compile_search,
};

#[derive(Clone)]
enum UndoEntry {
    Upsert {
        affected_ids: Vec<u32>,
        previous_cards: Vec<Option<CardDto>>,
        asset_change: Option<CardAssetIdChange>,
        id_change: Option<Value>,
    },
    Delete {
        cards: Vec<CardDto>,
    },
}

pub struct DocumentHostState {
    undo: Mutex<HashMap<String, VecDeque<UndoEntry>>>,
    pending_assets: Mutex<HashMap<String, Vec<(CardAssetIdChange, bool)>>>,
}

impl DocumentHostState {
    pub fn new() -> Self {
        Self {
            undo: Mutex::new(HashMap::new()),
            pending_assets: Mutex::new(HashMap::new()),
        }
    }

    pub fn clear(&self, document_id: &str) -> Result<(), String> {
        let mut pending = self
            .pending_assets
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(changes) = pending.get_mut(document_id) {
            while let Some((assets, applied)) = changes.last() {
                if *applied {
                    assets.rollback()?;
                } else {
                    assets.reapply()?;
                }
                changes.pop();
            }
        }
        pending.remove(document_id);
        let mut undo = self
            .undo
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        undo.remove(document_id);
        Ok(())
    }

    fn record_asset_change(&self, document_id: &str, change: CardAssetIdChange, applied: bool) {
        self.pending_assets
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .entry(document_id.to_string())
            .or_default()
            .push((change, applied));
    }

    fn commit_asset_changes(&self, document_id: &str) {
        self.pending_assets
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(document_id);
    }
}

pub fn query(
    sessions: &OpenCdbSessions,
    document_id: String,
    query: CardCollectionQuery,
) -> Result<Value, String> {
    match query {
        CardCollectionQuery::Search {
            expression,
            page,
            page_size,
        } => {
            let compiled = compile_search(&expression)?;
            let response = cdb_cards::search_cards_page(
                sessions,
                crate::models::cdb::SearchCardsPageRequest {
                    tab_id: document_id,
                    where_clause: compiled.clause,
                    params: compiled.params,
                    page: Some(page),
                    page_size: Some(page_size),
                },
            )?;
            to_value(CardSearchPage {
                cards: response.cards,
                total: response.total,
            })
            .map_err(|err| err.to_string())
        }
        CardCollectionQuery::SearchAll { expression } => {
            let compiled = compile_search(&expression)?;
            to_value(cdb_cards::query_cards_raw(
                sessions,
                crate::models::cdb::QueryCardsRequest {
                    tab_id: document_id,
                    query_clause: format!("{} ORDER BY datas.id", compiled.clause),
                    params: compiled.params,
                },
            )?)
            .map_err(|err| err.to_string())
        }
        CardCollectionQuery::GetById { card_id } => {
            to_value(cdb_cards::get_card_by_id(sessions, document_id, card_id)?)
                .map_err(|err| err.to_string())
        }
        CardCollectionQuery::GetByIds { card_ids } => to_value(cdb_cards::get_cards_by_ids(
            sessions,
            crate::models::cdb::GetCardsByIdsRequest {
                tab_id: document_id,
                card_ids,
            },
        )?)
        .map_err(|err| err.to_string()),
        CardCollectionQuery::FindByNames { names } => {
            if names.is_empty() {
                return Ok(json!([]));
            }
            let mut params = HashMap::new();
            let placeholders = names
                .into_iter()
                .enumerate()
                .map(|(index, name)| {
                    let key = format!("name{index}");
                    params.insert(key.clone(), json!(name));
                    format!(":{key}")
                })
                .collect::<Vec<_>>();
            to_value(cdb_cards::query_cards_raw(
                sessions,
                crate::models::cdb::QueryCardsRequest {
                    tab_id: document_id,
                    query_clause: format!(
                        "texts.name IN ({}) ORDER BY datas.id",
                        placeholders.join(", ")
                    ),
                    params,
                },
            )?)
            .map_err(|err| err.to_string())
        }
        CardCollectionQuery::All => to_value(cdb_cards::query_cards_raw(
            sessions,
            crate::models::cdb::QueryCardsRequest {
                tab_id: document_id,
                query_clause: "1=1 ORDER BY datas.id".to_string(),
                params: HashMap::new(),
            },
        )?)
        .map_err(|err| err.to_string()),
    }
}

pub fn execute(
    state: &DocumentHostState,
    sessions: &OpenCdbSessions,
    document_id: String,
    command: CardCollectionCommand,
) -> Result<ProviderCommandResult, String> {
    let mut value = None;
    match command {
        CardCollectionCommand::Upsert { cards } => {
            let affected_ids = cards.iter().map(|card| card.code).collect::<Vec<_>>();
            // Single bulk query for previous state instead of one round-trip
            // per affected id (was N session locks + N SQL queries).
            let found_previous = cdb_cards::get_cards_by_ids(
                sessions,
                crate::models::cdb::GetCardsByIdsRequest {
                    tab_id: document_id.clone(),
                    card_ids: affected_ids.clone(),
                },
            )?;
            let previous_by_id: HashMap<u32, CardDto> = found_previous
                .into_iter()
                .map(|card| (card.code, card))
                .collect();
            let previous_cards = affected_ids
                .iter()
                .map(|card_id| previous_by_id.get(card_id).cloned())
                .collect::<Vec<_>>();
            cdb_cards::modify_cards(
                sessions,
                crate::models::cdb::ModifyCardsRequest {
                    tab_id: document_id.clone(),
                    cards,
                },
            )?;
            push_undo(
                state,
                document_id,
                UndoEntry::Upsert {
                    affected_ids,
                    previous_cards,
                    asset_change: None,
                    id_change: None,
                },
            );
        }
        CardCollectionCommand::Delete { card_ids } => {
            let cards = cdb_cards::get_cards_by_ids(
                sessions,
                crate::models::cdb::GetCardsByIdsRequest {
                    tab_id: document_id.clone(),
                    card_ids: card_ids.clone(),
                },
            )?;
            cdb_cards::delete_cards(
                sessions,
                crate::models::cdb::DeleteCardsRequest {
                    tab_id: document_id.clone(),
                    card_ids,
                },
            )?;
            push_undo(state, document_id, UndoEntry::Delete { cards });
        }
        CardCollectionCommand::ReplaceCardId {
            card,
            original_card_id,
            remove_original,
        } => {
            if card.code == original_card_id {
                return Err("Replacement card ID must differ from the original ID".to_string());
            }
            let affected_ids = vec![card.code, original_card_id];
            let found_previous = cdb_cards::get_cards_by_ids(
                sessions,
                crate::models::cdb::GetCardsByIdsRequest {
                    tab_id: document_id.clone(),
                    card_ids: affected_ids.clone(),
                },
            )?;
            let previous_by_id = found_previous
                .into_iter()
                .map(|previous| (previous.code, previous))
                .collect::<HashMap<_, _>>();
            let previous_cards = affected_ids
                .iter()
                .map(|card_id| previous_by_id.get(card_id).cloned())
                .collect::<Vec<_>>();
            let cdb_path =
                with_session_meta(sessions, &document_id, |session| Ok(session.path.clone()))?;
            let asset_change =
                CardAssetIdChange::apply(&cdb_path, original_card_id, card.code, remove_original)?;
            let id_change = json!({
                "originalCardId": original_card_id,
                "newCardId": card.code,
                "removeOriginal": remove_original,
                "cdbPath": cdb_path,
            });
            if let Err(error) = cdb_cards::undo_modify_operation(
                sessions,
                crate::models::cdb::UndoModifyOperationRequest {
                    tab_id: document_id.clone(),
                    cards_to_restore: vec![card],
                    ids_to_delete: if remove_original {
                        vec![original_card_id]
                    } else {
                        vec![]
                    },
                },
            ) {
                asset_change.rollback()?;
                return Err(error);
            }
            value = Some(json!({ "cardIdChange": id_change }));
            state.record_asset_change(&document_id, asset_change.clone(), true);
            push_undo(
                state,
                document_id,
                UndoEntry::Upsert {
                    affected_ids,
                    previous_cards,
                    asset_change: Some(asset_change),
                    id_change: Some(id_change),
                },
            );
        }
    }
    Ok(ProviderCommandResult {
        changed: true,
        value,
    })
}

pub fn undo(
    state: &DocumentHostState,
    sessions: &OpenCdbSessions,
    document_id: String,
) -> Result<ProviderCommandResult, String> {
    let entry = {
        let mut undo = state
            .undo
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        undo.get_mut(&document_id).and_then(VecDeque::pop_back)
    };
    let Some(entry) = entry else {
        return Ok(ProviderCommandResult {
            changed: false,
            value: None,
        });
    };

    let mut value = json!({ "undone": true });
    let result = (|| -> Result<(), String> {
        match entry.clone() {
            UndoEntry::Upsert {
                affected_ids,
                previous_cards,
                asset_change,
                id_change,
            } => {
                let cards_to_restore = previous_cards.iter().flatten().cloned().collect::<Vec<_>>();
                let ids_to_delete = affected_ids
                    .into_iter()
                    .zip(previous_cards)
                    .filter_map(|(card_id, previous)| previous.is_none().then_some(card_id))
                    .collect::<Vec<_>>();
                if let Some(assets) = &asset_change {
                    assets.rollback()?;
                }
                if let Err(error) = cdb_cards::undo_modify_operation(
                    sessions,
                    crate::models::cdb::UndoModifyOperationRequest {
                        tab_id: document_id.clone(),
                        cards_to_restore,
                        ids_to_delete,
                    },
                ) {
                    if let Some(assets) = &asset_change {
                        assets.reapply()?;
                    }
                    return Err(error);
                }
                if let Some(mut change) = id_change {
                    change["reversed"] = json!(true);
                    value["cardIdChange"] = change;
                }
                if let Some(assets) = asset_change {
                    state.record_asset_change(&document_id, assets, false);
                }
            }
            UndoEntry::Delete { cards } => {
                cdb_cards::modify_cards(
                    sessions,
                    crate::models::cdb::ModifyCardsRequest {
                        tab_id: document_id.clone(),
                        cards,
                    },
                )?;
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        push_undo(state, document_id, entry);
        return Err(error);
    }
    Ok(ProviderCommandResult {
        changed: true,
        value: Some(value),
    })
}

pub fn save(
    state: &DocumentHostState,
    sessions: &OpenCdbSessions,
    document_id: String,
    destination_uri: Option<String>,
) -> Result<String, String> {
    let path = cdb_session::save_cdb_tab_to(sessions, document_id.clone(), destination_uri)?;
    state.commit_asset_changes(&document_id);
    Ok(path)
}

fn push_undo(state: &DocumentHostState, document_id: String, entry: UndoEntry) {
    let mut undo = state
        .undo
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let stack = undo.entry(document_id).or_default();
    stack.push_back(entry);
    if stack.len() > 100 {
        stack.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, fs, sync::Mutex};

    use super::*;
    use crate::{
        document_host::models::{CardSearchExpression, CompareOperator, NumericField},
        services::cdb_session::open_cdb_tab_in_dir,
        test_helpers::{create_test_cdb, make_temp_dir},
    };

    #[test]
    fn search_all_returns_every_matching_card_in_id_order() {
        let root = make_temp_dir("search-all");
        let source_path = root.join("cards.cdb");
        let cards = (1..=450)
            .map(|code| (code, if code % 2 == 0 { 2 } else { 1 }))
            .collect::<Vec<_>>();
        create_test_cdb(&source_path, &cards);
        let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
        open_cdb_tab_in_dir(
            &sessions,
            &root.join("sessions"),
            "search-all-test".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .expect("open test CDB");

        let value = query(
            &sessions,
            "search-all-test".to_string(),
            CardCollectionQuery::SearchAll {
                expression: CardSearchExpression::Compare {
                    field: NumericField::Type,
                    operator: CompareOperator::Eq,
                    value: 2,
                },
            },
        )
        .expect("query every matching card");
        let result = value.as_array().expect("searchAll returns an array");

        assert_eq!(result.len(), 225);
        assert_eq!(
            result.first().and_then(|card| card["code"].as_u64()),
            Some(2)
        );
        assert_eq!(
            result.last().and_then(|card| card["code"].as_u64()),
            Some(450)
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn replacing_a_card_id_is_one_undoable_operation() {
        let root = make_temp_dir("replace-card-id");
        let source_path = root.join("cards.cdb");
        create_test_cdb(&source_path, &[(100, 1), (200, 2)]);
        let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
        open_cdb_tab_in_dir(
            &sessions,
            &root.join("sessions"),
            "replace-test".to_string(),
            source_path.to_string_lossy().to_string(),
        )
        .expect("open test CDB");
        let state = DocumentHostState::new();

        execute(
            &state,
            &sessions,
            "replace-test".to_string(),
            CardCollectionCommand::ReplaceCardId {
                card: CardDto {
                    code: 200,
                    type_: 3,
                    ..Default::default()
                },
                original_card_id: 100,
                remove_original: true,
            },
        )
        .expect("replace card ID");
        assert!(
            cdb_cards::get_card_by_id(&sessions, "replace-test".to_string(), 100)
                .expect("read original ID")
                .is_none()
        );
        assert_eq!(
            cdb_cards::get_card_by_id(&sessions, "replace-test".to_string(), 200)
                .expect("read replacement ID")
                .expect("replacement card")
                .type_,
            3
        );

        undo(&state, &sessions, "replace-test".to_string()).expect("undo replacement");
        assert_eq!(
            cdb_cards::get_card_by_id(&sessions, "replace-test".to_string(), 100)
                .expect("read restored original")
                .expect("restored original")
                .type_,
            1
        );
        assert_eq!(
            cdb_cards::get_card_by_id(&sessions, "replace-test".to_string(), 200)
                .expect("read restored target")
                .expect("restored target")
                .type_,
            2
        );
        assert!(
            !undo(&state, &sessions, "replace-test".to_string())
                .expect("second undo")
                .changed
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn changing_card_id_moves_or_copies_assets_and_undo_restores_them() {
        for remove_original in [true, false] {
            let root = make_temp_dir("card-id-assets");
            let source_path = root.join("cards.cdb");
            create_test_cdb(&source_path, &[(100, 1)]);
            fs::create_dir_all(root.join("pics/field")).unwrap();
            fs::create_dir_all(root.join("script")).unwrap();
            fs::write(root.join("pics/100.jpg"), b"main image").unwrap();
            fs::write(root.join("pics/field/100.png"), b"field image").unwrap();
            fs::write(root.join("script/c100.lua"), b"-- script").unwrap();
            let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
            open_cdb_tab_in_dir(
                &sessions,
                &root.join("sessions"),
                "assets".into(),
                source_path.to_string_lossy().into(),
            )
            .unwrap();
            let state = DocumentHostState::new();
            let result = execute(
                &state,
                &sessions,
                "assets".into(),
                CardCollectionCommand::ReplaceCardId {
                    card: CardDto {
                        code: 200,
                        type_: 1,
                        ..Default::default()
                    },
                    original_card_id: 100,
                    remove_original,
                },
            )
            .unwrap();
            assert_eq!(
                result.value.unwrap()["cardIdChange"]["removeOriginal"],
                remove_original
            );
            for (old, new) in [
                ("pics/100.jpg", "pics/200.jpg"),
                ("pics/field/100.png", "pics/field/200.png"),
                ("script/c100.lua", "script/c200.lua"),
            ] {
                assert_eq!(root.join(old).exists(), !remove_original);
                assert!(root.join(new).is_file());
            }
            assert_eq!(
                cdb_cards::get_card_by_id(&sessions, "assets".into(), 100)
                    .unwrap()
                    .is_some(),
                !remove_original
            );
            assert!(cdb_cards::get_card_by_id(&sessions, "assets".into(), 200)
                .unwrap()
                .is_some());
            let reversed = undo(&state, &sessions, "assets".into()).unwrap();
            assert_eq!(reversed.value.unwrap()["cardIdChange"]["reversed"], true);
            assert_eq!(fs::read(root.join("pics/100.jpg")).unwrap(), b"main image");
            assert_eq!(
                fs::read(root.join("pics/field/100.png")).unwrap(),
                b"field image"
            );
            assert_eq!(
                fs::read(root.join("script/c100.lua")).unwrap(),
                b"-- script"
            );
            assert!(!root.join("pics/200.jpg").exists());
            assert!(!root.join("pics/field/200.png").exists());
            assert!(!root.join("script/c200.lua").exists());
            assert!(cdb_cards::get_card_by_id(&sessions, "assets".into(), 100)
                .unwrap()
                .is_some());
            assert!(cdb_cards::get_card_by_id(&sessions, "assets".into(), 200)
                .unwrap()
                .is_none());
            let _ = fs::remove_dir_all(root);
        }
    }

    #[test]
    fn asset_collision_leaves_cards_and_source_assets_unchanged() {
        let root = make_temp_dir("card-id-collision");
        let source_path = root.join("cards.cdb");
        create_test_cdb(&source_path, &[(100, 1)]);
        fs::create_dir_all(root.join("pics")).unwrap();
        fs::create_dir_all(root.join("script")).unwrap();
        fs::write(root.join("pics/100.jpg"), b"original").unwrap();
        fs::write(root.join("script/c100.lua"), b"original script").unwrap();
        fs::write(root.join("script/c200.lua"), b"existing target").unwrap();
        let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
        open_cdb_tab_in_dir(
            &sessions,
            &root.join("sessions"),
            "collision".into(),
            source_path.to_string_lossy().into(),
        )
        .unwrap();
        let state = DocumentHostState::new();
        assert!(execute(
            &state,
            &sessions,
            "collision".into(),
            CardCollectionCommand::ReplaceCardId {
                card: CardDto {
                    code: 200,
                    ..Default::default()
                },
                original_card_id: 100,
                remove_original: true,
            }
        )
        .is_err());
        assert_eq!(fs::read(root.join("pics/100.jpg")).unwrap(), b"original");
        assert!(!root.join("pics/200.jpg").exists());
        assert_eq!(
            fs::read(root.join("script/c200.lua")).unwrap(),
            b"existing target"
        );
        assert!(
            cdb_cards::get_card_by_id(&sessions, "collision".into(), 100)
                .unwrap()
                .is_some()
        );
        assert!(
            cdb_cards::get_card_by_id(&sessions, "collision".into(), 200)
                .unwrap()
                .is_none()
        );
        assert!(!undo(&state, &sessions, "collision".into()).unwrap().changed);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn deleting_multiple_cards_is_one_undoable_operation() {
        let root = make_temp_dir("multi-delete");
        let source_path = root.join("cards.cdb");
        create_test_cdb(&source_path, &[(100, 1), (200, 1), (300, 1)]);
        let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
        open_cdb_tab_in_dir(
            &sessions,
            &root.join("sessions"),
            "delete".into(),
            source_path.to_string_lossy().into(),
        )
        .unwrap();
        let state = DocumentHostState::new();
        execute(
            &state,
            &sessions,
            "delete".into(),
            CardCollectionCommand::Delete {
                card_ids: vec![100, 200],
            },
        )
        .unwrap();
        for code in [100, 200] {
            assert!(cdb_cards::get_card_by_id(&sessions, "delete".into(), code)
                .unwrap()
                .is_none());
        }
        assert!(cdb_cards::get_card_by_id(&sessions, "delete".into(), 300)
            .unwrap()
            .is_some());
        undo(&state, &sessions, "delete".into()).unwrap();
        for code in [100, 200, 300] {
            assert!(cdb_cards::get_card_by_id(&sessions, "delete".into(), code)
                .unwrap()
                .is_some());
        }
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn discarding_workspace_restores_asset_names_to_the_last_saved_card_id() {
        for remove_original in [true, false] {
            for saved in [true, false] {
                for undone in [true, false] {
                    let root = make_temp_dir("card-id-discard");
                    let source_path = root.join("cards.cdb");
                    create_test_cdb(&source_path, &[(100, 1)]);
                    fs::create_dir_all(root.join("pics")).unwrap();
                    fs::write(root.join("pics/100.jpg"), b"image").unwrap();
                    let sessions = OpenCdbSessions(Mutex::new(HashMap::new()));
                    open_cdb_tab_in_dir(
                        &sessions,
                        &root.join("sessions"),
                        "discard".into(),
                        source_path.to_string_lossy().into(),
                    )
                    .unwrap();
                    let state = DocumentHostState::new();
                    execute(
                        &state,
                        &sessions,
                        "discard".into(),
                        CardCollectionCommand::ReplaceCardId {
                            card: CardDto {
                                code: 200,
                                ..Default::default()
                            },
                            original_card_id: 100,
                            remove_original,
                        },
                    )
                    .unwrap();
                    if saved {
                        save(&state, &sessions, "discard".into(), None).unwrap();
                    }
                    if undone {
                        undo(&state, &sessions, "discard".into()).unwrap();
                    }
                    state.clear("discard").unwrap();
                    assert_eq!(
                        root.join("pics/100.jpg").exists(),
                        !saved || !remove_original
                    );
                    assert_eq!(root.join("pics/200.jpg").exists(), saved);
                    cdb_session::close_cdb_tab(&sessions, "discard".into()).unwrap();
                    open_cdb_tab_in_dir(
                        &sessions,
                        &root.join("sessions"),
                        "reload".into(),
                        source_path.to_string_lossy().into(),
                    )
                    .unwrap();
                    assert_eq!(
                        cdb_cards::get_card_by_id(&sessions, "reload".into(), 100)
                            .unwrap()
                            .is_some(),
                        !saved || !remove_original
                    );
                    assert_eq!(
                        cdb_cards::get_card_by_id(&sessions, "reload".into(), 200)
                            .unwrap()
                            .is_some(),
                        saved
                    );
                    let _ = fs::remove_dir_all(root);
                }
            }
        }
    }
}
