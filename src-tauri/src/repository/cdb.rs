//! Thin adapter layer — all CDB operations now delegate to
//! [`ygopro_cdb_encode_rs::YgoProCdb`].
//!
//! This module exists so that the rest of the DEY codebase continues to
//! import `repository::cdb::*` and call free functions, keeping the
//! migration diff small. New code should prefer calling `YgoProCdb`
//! methods directly.

use std::path::Path;

use rusqlite::Connection;
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

/// Load only (code, type) from a CDB — avoids loading full card data
/// (15+ fields per card) when only the code and type are needed (e.g. merge analysis).
/// Uses a direct rusqlite connection for the lightweight query.
pub(crate) fn load_card_summaries_from_path(path: &Path) -> Result<Vec<(u32, u32)>, String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, type FROM datas WHERE id > 0 ORDER BY id")
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map([], |row| Ok((row.get::<_, u32>(0)?, row.get::<_, u32>(1)?)))
        .map_err(|err| err.to_string())?;

    let mut summaries = Vec::new();
    for row in rows {
        summaries.push(row.map_err(|err| err.to_string())?);
    }
    Ok(summaries)
}

pub(crate) fn recreate_cdb_with_cards(path: &Path, cards: &[CardDto]) -> Result<(), String> {
    let mut cdb = YgoProCdb::create_at_path(path).map_err(|err| err.to_string())?;
    cdb.add_cards(cards).map_err(|err| err.to_string())
}
