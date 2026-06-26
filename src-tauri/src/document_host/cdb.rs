use std::{collections::HashMap, sync::Mutex};

use serde_json::{json, to_value, Value};

use crate::{
    models::cdb::CardDto,
    services::{cdb_cards, cdb_session},
    session::cdb::OpenCdbSessions,
};

use super::{
    models::{CardCollectionCommand, CardCollectionQuery, CardSearchPage, ProviderCommandResult},
    search::compile_search,
};

enum UndoEntry {
    Upsert {
        affected_ids: Vec<u32>,
        previous_cards: Vec<Option<CardDto>>,
    },
    Delete {
        cards: Vec<CardDto>,
    },
}

pub struct DocumentHostState {
    undo: Mutex<HashMap<String, Vec<UndoEntry>>>,
}

impl DocumentHostState {
    pub fn new() -> Self {
        Self {
            undo: Mutex::new(HashMap::new()),
        }
    }

    pub fn clear(&self, document_id: &str) {
        let mut undo = self
            .undo
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        undo.remove(document_id);
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
    match command {
        CardCollectionCommand::Upsert { cards } => {
            let affected_ids = cards.iter().map(|card| card.code).collect::<Vec<_>>();
            let previous_cards = affected_ids
                .iter()
                .map(|card_id| cdb_cards::get_card_by_id(sessions, document_id.clone(), *card_id))
                .collect::<Result<Vec<_>, _>>()?;
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
    }
    Ok(ProviderCommandResult {
        changed: true,
        value: None,
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
        undo.get_mut(&document_id).and_then(Vec::pop)
    };
    let Some(entry) = entry else {
        return Ok(ProviderCommandResult {
            changed: false,
            value: None,
        });
    };

    match entry {
        UndoEntry::Upsert {
            affected_ids,
            previous_cards,
        } => {
            let cards_to_restore = previous_cards.iter().flatten().cloned().collect::<Vec<_>>();
            let ids_to_delete = affected_ids
                .into_iter()
                .zip(previous_cards)
                .filter_map(|(card_id, previous)| previous.is_none().then_some(card_id))
                .collect::<Vec<_>>();
            cdb_cards::undo_modify_operation(
                sessions,
                crate::models::cdb::UndoModifyOperationRequest {
                    tab_id: document_id,
                    cards_to_restore,
                    ids_to_delete,
                },
            )?;
        }
        UndoEntry::Delete { cards } => {
            cdb_cards::modify_cards(
                sessions,
                crate::models::cdb::ModifyCardsRequest {
                    tab_id: document_id,
                    cards,
                },
            )?;
        }
    }
    Ok(ProviderCommandResult {
        changed: true,
        value: Some(json!({ "undone": true })),
    })
}

pub fn save(
    sessions: &OpenCdbSessions,
    document_id: String,
    destination_uri: Option<String>,
) -> Result<String, String> {
    cdb_session::save_cdb_tab_to(sessions, document_id, destination_uri)
}

fn push_undo(state: &DocumentHostState, document_id: String, entry: UndoEntry) {
    let mut undo = state
        .undo
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let stack = undo.entry(document_id).or_default();
    stack.push(entry);
    if stack.len() > 100 {
        stack.remove(0);
    }
}
