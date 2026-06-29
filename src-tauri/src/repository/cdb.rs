//! Thin adapter layer — all CDB operations now delegate to
//! [`ygopro_cdb_encode_rs::YgoProCdb`].
//!
//! This module exists so that the rest of the DEY codebase continues to
//! import `repository::cdb::*` and call free functions, keeping the
//! migration diff small. New code should prefer calling `YgoProCdb`
//! methods directly.

use std::collections::HashMap;
use std::path::Path;

use ygopro_cdb_encode_rs::YgoProCdb;

use crate::models::cdb::CardDto;

pub(crate) fn open_cdb(path: &Path) -> Result<YgoProCdb, String> {
    YgoProCdb::from_path_direct(path).map_err(|err| err.to_string())
}

pub(crate) fn create_cdb(path: &Path) -> Result<YgoProCdb, String> {
    YgoProCdb::create_at_path(path).map_err(|err| err.to_string())
}

pub(crate) fn load_all_cards_from_path(path: &Path) -> Result<Vec<CardDto>, String> {
    let cdb = YgoProCdb::from_path(path).map_err(|err| err.to_string())?;
    cdb.find_all().map_err(|err| err.to_string())
}

/// Returns the total card count without materializing every card row.
/// Uses `query_raw_page` with page_size 1 so only a single card is decoded
/// while the engine still reports the full match count.
pub(crate) fn count_cards_from_path(path: &Path) -> Result<u32, String> {
    let cdb = open_cdb(path)?;
    let (_first_card, total) = cdb
        .query_raw_page("1=1", &HashMap::new(), 1, 1)
        .map_err(|err| err.to_string())?;
    Ok(total)
}

pub(crate) fn load_card_summaries_from_path(path: &Path) -> Result<Vec<(u32, u32)>, String> {
    Ok(load_all_cards_from_path(path)?
        .into_iter()
        .map(|card| (card.code, card.type_))
        .collect())
}

pub(crate) fn recreate_cdb_with_cards(path: &Path, cards: &[CardDto]) -> Result<(), String> {
    let mut cdb = YgoProCdb::create_at_path(path).map_err(|err| err.to_string())?;
    cdb.add_cards(cards).map_err(|err| err.to_string())
}
