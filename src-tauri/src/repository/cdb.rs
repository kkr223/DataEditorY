use regex::Regex;
use rusqlite::{functions::FunctionFlags, Connection, Statement};
use serde_json::Value as JsonValue;
use std::{collections::HashMap, fs, path::Path};

use crate::models::cdb::CardDto;

const CREATE_TABLE_STMT: &str = concat!(
    "CREATE TABLE IF NOT EXISTS datas(",
    "id integer primary key,",
    "ot integer,",
    "alias integer,",
    "setcode integer,",
    "type integer,",
    "atk integer,",
    "def integer,",
    "level integer,",
    "race integer,",
    "attribute integer,",
    "category integer",
    ");",
    "CREATE TABLE IF NOT EXISTS texts(",
    "id integer primary key,",
    "name text,",
    "desc text,",
    "str1 text,",
    "str2 text,",
    "str3 text,",
    "str4 text,",
    "str5 text,",
    "str6 text,",
    "str7 text,",
    "str8 text,",
    "str9 text,",
    "str10 text,",
    "str11 text,",
    "str12 text,",
    "str13 text,",
    "str14 text,",
    "str15 text,",
    "str16 text",
    ");"
);
const INSERT_EMPTY_TEXTS_FROM_DATAS_STMT: &str = concat!(
    "INSERT OR IGNORE INTO texts(",
    "id,name,desc,str1,str2,str3,str4,str5,str6,str7,str8,str9,str10,str11,str12,str13,str14,str15,str16",
    ") ",
    "SELECT datas.id,'' AS name,'' AS desc,'' AS str1,'' AS str2,'' AS str3,'' AS str4,'' AS str5,'' AS str6,'' AS str7,'' AS str8,'' AS str9,'' AS str10,'' AS str11,'' AS str12,'' AS str13,'' AS str14,'' AS str15,'' AS str16 ",
    "FROM datas"
);
const SELECT_CARD_COLUMNS: &str = concat!(
    "SELECT datas.id, datas.ot, datas.alias, datas.setcode, datas.type, datas.atk, datas.def, datas.level, datas.race, datas.attribute, datas.category,",
    " texts.name, texts.desc, texts.str1, texts.str2, texts.str3, texts.str4, texts.str5, texts.str6, texts.str7, texts.str8,",
    " texts.str9, texts.str10, texts.str11, texts.str12, texts.str13, texts.str14, texts.str15, texts.str16 ",
    "FROM datas INNER JOIN texts ON datas.id = texts.id"
);
const INSERT_DATAS_STMT: &str =
    "INSERT OR REPLACE INTO datas(id,ot,alias,setcode,type,atk,def,level,race,attribute,category) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
const INSERT_TEXTS_STMT: &str = concat!(
    "INSERT OR REPLACE INTO texts(",
    "id,name,desc,str1,str2,str3,str4,str5,str6,str7,str8,str9,str10,str11,str12,str13,str14,str15,str16",
    ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
);

const TYPE_LINK: u32 = 0x4000000;
const TYPE_TOKEN: u32 = 0x4000;
const CARD_ARTWORK_VERSIONS_OFFSET: u32 = 20;

fn sanitize_clause(clause: &str) -> String {
    let trimmed = clause.trim();
    if trimmed.is_empty() {
        "1=1".to_string()
    } else {
        trimmed.to_string()
    }
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    let mut regex_cache: HashMap<String, Regex> = HashMap::new();
    conn.create_scalar_function(
        "regexp",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        move |ctx| {
            let pattern = ctx.get::<String>(0)?;
            let input = ctx.get::<String>(1)?;
            if !regex_cache.contains_key(&pattern) {
                let compiled = Regex::new(&pattern)
                    .map_err(|err| rusqlite::Error::UserFunctionError(Box::new(err)))?;
                if regex_cache.len() >= 64 {
                    regex_cache.clear();
                }
                regex_cache.insert(pattern.clone(), compiled);
            }
            Ok(regex_cache[&pattern].is_match(&input))
        },
    )
    .map_err(|err| err.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=DELETE; \
         PRAGMA synchronous=NORMAL; \
         PRAGMA temp_store=MEMORY; \
         PRAGMA foreign_keys=OFF; \
         PRAGMA mmap_size=268435456; \
         PRAGMA cache_size=-20000;",
    )
    .map_err(|err| err.to_string())?;
    conn.execute_batch(CREATE_TABLE_STMT)
        .map_err(|err| err.to_string())?;
    conn.execute_batch(INSERT_EMPTY_TEXTS_FROM_DATAS_STMT)
        .map_err(|err| err.to_string())?;
    Ok(conn)
}

fn bind_json_params(
    stmt: &mut Statement<'_>,
    params: &HashMap<String, JsonValue>,
) -> Result<(), String> {
    for (key, value) in params {
        let parameter_name = if key.starts_with(':') || key.starts_with('@') || key.starts_with('$')
        {
            key.clone()
        } else {
            format!(":{key}")
        };

        let Some(index) = stmt
            .parameter_index(&parameter_name)
            .map_err(|err| err.to_string())?
        else {
            continue;
        };

        match value {
            JsonValue::Null => stmt
                .raw_bind_parameter(index, rusqlite::types::Null)
                .map_err(|err| err.to_string())?,
            JsonValue::Bool(boolean) => stmt
                .raw_bind_parameter(index, i64::from(*boolean))
                .map_err(|err| err.to_string())?,
            JsonValue::Number(number) => {
                if let Some(integer) = number.as_i64() {
                    stmt.raw_bind_parameter(index, integer)
                        .map_err(|err| err.to_string())?;
                } else if let Some(float) = number.as_f64() {
                    stmt.raw_bind_parameter(index, float)
                        .map_err(|err| err.to_string())?;
                } else if let Some(unsigned) = number.as_u64() {
                    stmt.raw_bind_parameter(index, unsigned as i64)
                        .map_err(|err| err.to_string())?;
                }
            }
            JsonValue::String(text) => stmt
                .raw_bind_parameter(index, text.as_str())
                .map_err(|err| err.to_string())?,
            other => stmt
                .raw_bind_parameter(index, other.to_string())
                .map_err(|err| err.to_string())?,
        }
    }

    Ok(())
}

pub(crate) fn count_cards(
    conn: &Connection,
    where_clause: &str,
    params: &HashMap<String, JsonValue>,
) -> Result<u32, String> {
    let sql = format!(
        "SELECT COUNT(*) FROM datas INNER JOIN texts ON datas.id = texts.id WHERE {}",
        sanitize_clause(where_clause)
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    bind_json_params(&mut stmt, params)?;
    let mut rows = stmt.raw_query();
    let Some(row) = rows.next().map_err(|err| err.to_string())? else {
        return Ok(0);
    };
    let total: i64 = row.get(0).map_err(|err| err.to_string())?;
    Ok(total.max(0) as u32)
}

fn to_setcode_list(raw: i64) -> Vec<u16> {
    let mut value = raw as u64;
    let mut result = Vec::new();
    while value != 0 && result.len() < 16 {
        let chunk = (value & 0xffff) as u16;
        if chunk != 0 {
            result.push(chunk);
        }
        value >>= 16;
    }
    result
}

fn to_packed_setcode(list: &[u16]) -> i64 {
    let mut value = 0_u64;
    for (index, chunk) in list.iter().take(16).enumerate() {
        value |= (u64::from(*chunk) & 0xffff) << (index * 16);
    }
    value as i64
}

fn normalize_alias_rule(code: u32, alias: u32, type_value: u32) -> (u32, u32) {
    let mut normalized_alias = alias;
    let mut rule_code = 0_u32;

    if code == 5_405_695 {
        rule_code = normalized_alias;
        normalized_alias = 0;
    } else if normalized_alias != 0 && (type_value & TYPE_TOKEN) == 0 {
        let is_alternative = normalized_alias < code + CARD_ARTWORK_VERSIONS_OFFSET
            && code < normalized_alias + CARD_ARTWORK_VERSIONS_OFFSET;
        if !is_alternative {
            rule_code = normalized_alias;
            normalized_alias = 0;
        }
    }

    (normalized_alias, rule_code)
}

fn card_from_row(row: &rusqlite::Row<'_>) -> Result<CardDto, rusqlite::Error> {
    let code = row.get::<_, i64>("id")? as u32;
    let type_value = row.get::<_, i64>("type")? as u32;
    let mut defense = row.get::<_, i64>("def")? as i32;
    let mut link_marker = 0_u32;

    if (type_value & TYPE_LINK) != 0 {
        link_marker = defense.max(0) as u32;
        defense = 0;
    }

    let level_raw = row.get::<_, i64>("level")? as u32;
    let alias_raw = row.get::<_, i64>("alias")? as u32;
    let (alias, rule_code) = normalize_alias_rule(code, alias_raw, type_value);

    let mut strings = Vec::with_capacity(16);
    for index in 1..=16 {
        strings.push(
            row.get::<_, Option<String>>(format!("str{index}").as_str())?
                .unwrap_or_default(),
        );
    }

    Ok(CardDto {
        code,
        alias,
        setcode: to_setcode_list(row.get::<_, i64>("setcode")?),
        type_: type_value,
        attack: row.get::<_, i64>("atk")? as i32,
        defense,
        level: level_raw & 0xff,
        race: row.get::<_, i64>("race")? as u32,
        attribute: row.get::<_, i64>("attribute")? as u32,
        category: row.get::<_, i64>("category")? as u64,
        ot: row.get::<_, i64>("ot")? as u32,
        name: row.get::<_, Option<String>>("name")?.unwrap_or_default(),
        desc: row.get::<_, Option<String>>("desc")?.unwrap_or_default(),
        strings,
        lscale: (level_raw >> 24) & 0xff,
        rscale: (level_raw >> 16) & 0xff,
        link_marker,
        rule_code,
    })
}

pub(crate) fn query_cards(
    conn: &Connection,
    query_clause: &str,
    params: &HashMap<String, JsonValue>,
) -> Result<Vec<CardDto>, String> {
    let sql = format!(
        "{SELECT_CARD_COLUMNS} WHERE {}",
        sanitize_clause(query_clause)
    );
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    bind_json_params(&mut stmt, params)?;
    let mut rows = stmt.raw_query();
    let mut cards = Vec::new();

    while let Some(row) = rows.next().map_err(|err| err.to_string())? {
        cards.push(card_from_row(row).map_err(|err| err.to_string())?);
    }

    Ok(cards)
}

pub(crate) fn get_card(conn: &Connection, card_id: u32) -> Result<Option<CardDto>, String> {
    let sql = format!("{SELECT_CARD_COLUMNS} WHERE datas.id = :id LIMIT 1");
    let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
    let Some(index) = stmt.parameter_index(":id").map_err(|err| err.to_string())? else {
        return Err("Missing :id parameter in get_card query".to_string());
    };
    stmt.raw_bind_parameter(index, i64::from(card_id))
        .map_err(|err| err.to_string())?;
    let mut rows = stmt.raw_query();
    let Some(row) = rows.next().map_err(|err| err.to_string())? else {
        return Ok(None);
    };
    card_from_row(row).map(Some).map_err(|err| err.to_string())
}

fn write_card(
    stmt_datas: &mut Statement<'_>,
    stmt_texts: &mut Statement<'_>,
    card: &CardDto,
) -> Result<(), String> {
    let is_link = (card.type_ & TYPE_LINK) != 0;
    let stored_alias = if card.alias != 0 {
        card.alias
    } else {
        card.rule_code
    };
    let stored_level =
        (card.level & 0xff) | ((card.rscale & 0xff) << 16) | ((card.lscale & 0xff) << 24);
    let stored_defense = if is_link {
        card.link_marker as i32
    } else {
        card.defense
    };
    let setcode = to_packed_setcode(&card.setcode);

    stmt_datas
        .execute(rusqlite::params![
            i64::from(card.code),
            i64::from(card.ot),
            i64::from(stored_alias),
            setcode,
            i64::from(card.type_),
            i64::from(card.attack),
            i64::from(stored_defense),
            i64::from(stored_level),
            i64::from(card.race),
            i64::from(card.attribute),
            card.category as i64,
        ])
        .map_err(|err| err.to_string())?;

    let mut strings = card.strings.clone();
    strings.resize(16, String::new());

    stmt_texts
        .execute(rusqlite::params![
            i64::from(card.code),
            card.name,
            card.desc,
            strings[0],
            strings[1],
            strings[2],
            strings[3],
            strings[4],
            strings[5],
            strings[6],
            strings[7],
            strings[8],
            strings[9],
            strings[10],
            strings[11],
            strings[12],
            strings[13],
            strings[14],
            strings[15],
        ])
        .map_err(|err| err.to_string())?;

    Ok(())
}

pub(crate) fn load_all_cards_from_path(path: &Path) -> Result<Vec<CardDto>, String> {
    let conn = open_connection(path)?;
    query_cards(&conn, "1=1 ORDER BY datas.id", &HashMap::new())
}

pub(crate) fn recreate_cdb_with_cards(path: &Path, cards: &[CardDto]) -> Result<(), String> {
    ensure_parent_dir(path)?;
    if path.exists() {
        fs::remove_file(path).map_err(|err| err.to_string())?;
    }

    let mut conn = open_connection(path)?;
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    {
        tx.execute("DELETE FROM datas", [])
            .map_err(|err| err.to_string())?;
        tx.execute("DELETE FROM texts", [])
            .map_err(|err| err.to_string())?;

        let mut stmt_datas = tx
            .prepare(INSERT_DATAS_STMT)
            .map_err(|err| err.to_string())?;
        let mut stmt_texts = tx
            .prepare(INSERT_TEXTS_STMT)
            .map_err(|err| err.to_string())?;
        for card in cards {
            write_card(&mut stmt_datas, &mut stmt_texts, card)?;
        }
    }
    tx.commit().map_err(|err| err.to_string())
}

pub(crate) fn upsert_cards(conn: &mut Connection, cards: &[CardDto]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    {
        let mut stmt_datas = tx
            .prepare(INSERT_DATAS_STMT)
            .map_err(|err| err.to_string())?;
        let mut stmt_texts = tx
            .prepare(INSERT_TEXTS_STMT)
            .map_err(|err| err.to_string())?;
        for card in cards {
            write_card(&mut stmt_datas, &mut stmt_texts, card)?;
        }
    }
    tx.commit().map_err(|err| err.to_string())
}

pub(crate) fn delete_cards_by_id(conn: &mut Connection, card_ids: &[u32]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    for card_id in card_ids {
        tx.execute("DELETE FROM datas WHERE id = ?", [i64::from(*card_id)])
            .map_err(|err| err.to_string())?;
        tx.execute("DELETE FROM texts WHERE id = ?", [i64::from(*card_id)])
            .map_err(|err| err.to_string())?;
    }
    tx.commit().map_err(|err| err.to_string())
}

/// Atomically restore cards and delete cards in a single transaction.
/// Used by the undo system to guarantee that either both operations succeed
/// or neither does.
pub(crate) fn undo_modify_operation(
    conn: &mut Connection,
    cards_to_restore: &[CardDto],
    ids_to_delete: &[u32],
) -> Result<(), String> {
    let tx = conn.transaction().map_err(|err| err.to_string())?;
    {
        if !cards_to_restore.is_empty() {
            let mut stmt_datas = tx
                .prepare(INSERT_DATAS_STMT)
                .map_err(|err| err.to_string())?;
            let mut stmt_texts = tx
                .prepare(INSERT_TEXTS_STMT)
                .map_err(|err| err.to_string())?;
            for card in cards_to_restore {
                write_card(&mut stmt_datas, &mut stmt_texts, card)?;
            }
        }
        for card_id in ids_to_delete {
            tx.execute("DELETE FROM datas WHERE id = ?", [i64::from(*card_id)])
                .map_err(|err| err.to_string())?;
            tx.execute("DELETE FROM texts WHERE id = ?", [i64::from(*card_id)])
                .map_err(|err| err.to_string())?;
        }
    }
    tx.commit().map_err(|err| err.to_string())
}
