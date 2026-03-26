use rand::RngCore;
use regex::Regex;
use rusqlite::{functions::FunctionFlags, Connection, Statement};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

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
const TYPE_SPELL: u32 = 0x2;
const SUBTYPE_FIELD: u32 = 0x80000;
const CARD_ARTWORK_VERSIONS_OFFSET: u32 = 20;
const PAGE_SIZE_DEFAULT: u32 = 50;
const PAGE_SIZE_MAX: u32 = 200;

#[derive(Clone)]
pub(crate) struct CdbSessionMeta {
    path: String,
    working_path: PathBuf,
}

pub struct OpenCdbSessions(pub Mutex<HashMap<String, CdbSessionMeta>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDto {
    pub code: u32,
    pub alias: u32,
    pub setcode: Vec<u16>,
    #[serde(rename = "type")]
    pub type_: u32,
    pub attack: i32,
    pub defense: i32,
    pub level: u32,
    pub race: u32,
    pub attribute: u32,
    pub category: u64,
    pub ot: u32,
    pub name: String,
    pub desc: String,
    pub strings: Vec<String>,
    pub lscale: u32,
    pub rscale: u32,
    pub link_marker: u32,
    pub rule_code: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCardsPageRequest {
    pub tab_id: String,
    pub where_clause: String,
    #[serde(default)]
    pub params: HashMap<String, JsonValue>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCardsPageResponse {
    pub cards: Vec<CardDto>,
    pub total: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryCardsRequest {
    pub tab_id: String,
    pub query_clause: String,
    #[serde(default)]
    pub params: HashMap<String, JsonValue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenCdbTabResponse {
    pub name: String,
    pub cached_cards: Vec<CardDto>,
    pub cached_total: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModifyCardsRequest {
    pub tab_id: String,
    pub cards: Vec<CardDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCardsRequest {
    pub tab_id: String,
    pub card_ids: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCdbFromCardsRequest {
    pub output_path: String,
    pub cards: Vec<CardDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeConflictDto {
    pub code: u32,
    pub a_card: CardDto,
    pub b_card: CardDto,
    pub has_card_conflict: bool,
    pub has_image_conflict: bool,
    pub has_field_image_conflict: bool,
    pub has_script_conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCdbMergeResponse {
    pub a_name: String,
    pub b_name: String,
    pub a_total: u32,
    pub b_total: u32,
    pub merged_total: u32,
    pub conflicts: Vec<MergeConflictDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCdbMergeRequest {
    pub a_path: String,
    pub b_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCdbMergeRequest {
    pub a_path: String,
    pub b_path: String,
    pub output_path: String,
    pub conflict_mode: String,
    #[serde(default)]
    pub manual_choices: HashMap<u32, String>,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyCardAssetsRequest {
    pub source_cdb_path: String,
    pub target_cdb_path: String,
    pub card_ids: Vec<u32>,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

fn sanitize_clause(clause: &str) -> String {
    let trimmed = clause.trim();
    if trimmed.is_empty() {
        "1=1".to_string()
    } else {
        trimmed.to_string()
    }
}

fn canonicalize_path(path: &str) -> String {
    fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .to_string()
}

fn app_temp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|err| err.to_string())?;
    let dir = base.join("cdb-sessions");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn build_temp_path(app: &AppHandle, tab_id: &str) -> Result<PathBuf, String> {
    let mut nonce = [0_u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce);
    Ok(app_temp_dir(app)?.join(format!(
        "{}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}.cdb",
        tab_id, nonce[0], nonce[1], nonce[2], nonce[3], nonce[4], nonce[5], nonce[6], nonce[7]
    )))
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown.cdb".to_string())
}

fn cleanup_temp_path(path: &Path) {
    let _ = fs::remove_file(path);
    let _ = fs::remove_file(path.with_extension("cdb-journal"));
    let _ = fs::remove_file(path.with_extension("cdb-wal"));
    let _ = fs::remove_file(path.with_extension("cdb-shm"));
}

fn ensure_parent_dir(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|err| err.to_string())
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    conn.create_scalar_function(
        "regexp",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let pattern = ctx.get::<String>(0)?;
            let input = ctx.get::<String>(1)?;
            let regex = Regex::new(&pattern)
                .map_err(|err| rusqlite::Error::UserFunctionError(Box::new(err)))?;
            Ok(regex.is_match(&input))
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

fn cdb_dir_from_path(path: &str) -> Result<PathBuf, String> {
    Path::new(path)
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve the database directory".to_string())
}

fn main_image_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("pics").join(format!("{card_id}.jpg"))
}

fn field_image_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("pics").join("field").join(format!("{card_id}.jpg"))
}

fn script_path(cdb_dir: &Path, card_id: u32) -> PathBuf {
    cdb_dir.join("script").join(format!("c{card_id}.lua"))
}

fn load_all_cards_from_path(path: &Path) -> Result<Vec<CardDto>, String> {
    let conn = open_connection(path)?;
    query_cards(&conn, "1=1 ORDER BY datas.id", &HashMap::new())
}

fn recreate_cdb_with_cards(path: &Path, cards: &[CardDto]) -> Result<(), String> {
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

        let mut stmt_datas = tx.prepare(INSERT_DATAS_STMT).map_err(|err| err.to_string())?;
        let mut stmt_texts = tx.prepare(INSERT_TEXTS_STMT).map_err(|err| err.to_string())?;
        for card in cards {
            write_card(&mut stmt_datas, &mut stmt_texts, card)?;
        }
    }
    tx.commit().map_err(|err| err.to_string())
}

fn copy_if_exists(src: &Path, dest: &Path) -> Result<bool, String> {
    if !src.is_file() {
        return Ok(false);
    }

    ensure_parent_dir(dest)?;
    fs::copy(src, dest).map_err(|err| err.to_string())?;
    Ok(true)
}

fn build_stage_dir(output_path: &Path, label: &str) -> Result<PathBuf, String> {
    let mut nonce = [0_u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce);
    let parent = output_path
        .parent()
        .ok_or_else(|| "Unable to resolve the output directory".to_string())?;
    Ok(parent.join(format!(
        ".__dataeditory-{label}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        nonce[0], nonce[1], nonce[2], nonce[3], nonce[4], nonce[5], nonce[6], nonce[7]
    )))
}

fn with_session_meta<T>(
    state: &State<'_, OpenCdbSessions>,
    tab_id: &str,
    f: impl FnOnce(&CdbSessionMeta) -> Result<T, String>,
) -> Result<T, String> {
    let sessions = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire cdb sessions".to_string())?;
    let session = sessions
        .get(tab_id)
        .ok_or_else(|| format!("Unknown cdb tab: {tab_id}"))?;
    f(session)
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

fn count_cards(
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

fn query_cards(
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

fn get_card(conn: &Connection, card_id: u32) -> Result<Option<CardDto>, String> {
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

fn analyze_cdb_merge_paths(a_path: &str, b_path: &str) -> Result<AnalyzeCdbMergeResponse, String> {
    let a_cards = load_all_cards_from_path(Path::new(a_path))?;
    let b_cards = load_all_cards_from_path(Path::new(b_path))?;
    let a_dir = cdb_dir_from_path(a_path)?;
    let b_dir = cdb_dir_from_path(b_path)?;

    let a_by_code: HashMap<u32, CardDto> = a_cards.iter().cloned().map(|card| (card.code, card)).collect();
    let b_by_code: HashMap<u32, CardDto> = b_cards.iter().cloned().map(|card| (card.code, card)).collect();

    let mut all_codes = a_by_code.keys().copied().collect::<Vec<_>>();
    for code in b_by_code.keys().copied() {
        if !all_codes.contains(&code) {
            all_codes.push(code);
        }
    }
    all_codes.sort_unstable();

    let mut conflicts = Vec::new();
    for code in all_codes {
        let Some(a_card) = a_by_code.get(&code).cloned() else {
            continue;
        };
        let Some(b_card) = b_by_code.get(&code).cloned() else {
            continue;
        };

        let a_image = main_image_path(&a_dir, code).is_file();
        let b_image = main_image_path(&b_dir, code).is_file();
        let a_field_image = field_image_path(&a_dir, code).is_file();
        let b_field_image = field_image_path(&b_dir, code).is_file();
        let a_script = script_path(&a_dir, code).is_file();
        let b_script = script_path(&b_dir, code).is_file();

        let has_card_conflict = a_card != b_card;
        let has_image_conflict = a_image && b_image;
        let has_field_image_conflict = a_field_image && b_field_image;
        let has_script_conflict = a_script && b_script;

        if has_card_conflict || has_image_conflict || has_field_image_conflict || has_script_conflict {
            conflicts.push(MergeConflictDto {
                code,
                a_card,
                b_card,
                has_card_conflict,
                has_image_conflict,
                has_field_image_conflict,
                has_script_conflict,
            });
        }
    }

    let merged_total = {
        let mut unique_codes = a_by_code.keys().copied().collect::<Vec<_>>();
        for code in b_by_code.keys().copied() {
            if !unique_codes.contains(&code) {
                unique_codes.push(code);
            }
        }
        unique_codes.len() as u32
    };

    Ok(AnalyzeCdbMergeResponse {
        a_name: basename(a_path),
        b_name: basename(b_path),
        a_total: a_cards.len() as u32,
        b_total: b_cards.len() as u32,
        merged_total,
        conflicts,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MergeSide {
    A,
    B,
}

fn choose_merge_side(
    conflict_mode: &str,
    code: u32,
    manual_choices: &HashMap<u32, String>,
) -> Result<MergeSide, String> {
    match conflict_mode {
        "preferA" => Ok(MergeSide::A),
        "preferB" => Ok(MergeSide::B),
        "manual" => match manual_choices.get(&code).map(|value| value.trim()) {
            Some("a") | Some("A") => Ok(MergeSide::A),
            Some("b") | Some("B") => Ok(MergeSide::B),
            _ => Err(format!("Missing manual merge choice for card {code}")),
        },
        other => Err(format!("Unsupported merge conflict mode: {other}")),
    }
}

fn card_has_field_subtype(card: &CardDto) -> bool {
    (card.type_ & TYPE_SPELL) != 0 && (card.type_ & SUBTYPE_FIELD) != 0
}

#[tauri::command]
pub fn open_cdb_tab(
    app: AppHandle,
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let original_path = canonicalize_path(&path);
    let temp_path = build_temp_path(&app, &tab_id)?;
    ensure_parent_dir(&temp_path)?;
    fs::copy(&original_path, &temp_path).map_err(|err| err.to_string())?;

    let response = {
        let conn = open_connection(&temp_path)?;
        OpenCdbTabResponse {
            name: basename(&original_path),
            cached_cards: query_cards(
                &conn,
                "1=1 ORDER BY datas.id LIMIT 50 OFFSET 0",
                &HashMap::new(),
            )?,
            cached_total: count_cards(&conn, "1=1", &HashMap::new())?,
        }
    };

    let mut sessions = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire cdb sessions".to_string())?;
    if let Some(previous) = sessions.insert(
        tab_id,
        CdbSessionMeta {
            path: original_path,
            working_path: temp_path.clone(),
        },
    ) {
        cleanup_temp_path(&previous.working_path);
    }

    Ok(response)
}

#[tauri::command]
pub fn create_cdb_tab(
    app: AppHandle,
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    let original_path = PathBuf::from(path.trim());
    ensure_parent_dir(&original_path)?;

    let temp_path = build_temp_path(&app, &tab_id)?;
    ensure_parent_dir(&temp_path)?;

    {
        let _conn = open_connection(&temp_path)?;
    }

    fs::copy(&temp_path, &original_path).map_err(|err| err.to_string())?;

    let mut sessions = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire cdb sessions".to_string())?;
    if let Some(previous) = sessions.insert(
        tab_id,
        CdbSessionMeta {
            path: original_path.to_string_lossy().to_string(),
            working_path: temp_path,
        },
    ) {
        cleanup_temp_path(&previous.working_path);
    }

    Ok(OpenCdbTabResponse {
        name: basename(original_path.to_string_lossy().as_ref()),
        cached_cards: Vec::new(),
        cached_total: 0,
    })
}

#[tauri::command]
pub fn close_cdb_tab(state: State<'_, OpenCdbSessions>, tab_id: String) -> Result<(), String> {
    let mut sessions = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire cdb sessions".to_string())?;
    if let Some(session) = sessions.remove(&tab_id) {
        cleanup_temp_path(&session.working_path);
    }
    Ok(())
}

#[tauri::command]
pub fn save_cdb_tab(state: State<'_, OpenCdbSessions>, tab_id: String) -> Result<(), String> {
    with_session_meta(&state, &tab_id, |session| {
        let target_path = PathBuf::from(&session.path);
        ensure_parent_dir(&target_path)?;
        fs::copy(&session.working_path, &target_path).map_err(|err| err.to_string())?;
        Ok(())
    })
}

#[tauri::command]
pub fn search_cards_page(
    state: State<'_, OpenCdbSessions>,
    request: SearchCardsPageRequest,
) -> Result<SearchCardsPageResponse, String> {
    with_session_meta(&state, &request.tab_id, |session| {
        let conn = open_connection(&session.working_path)?;
        let page = request.page.unwrap_or(1).max(1);
        let page_size = request
            .page_size
            .unwrap_or(PAGE_SIZE_DEFAULT)
            .clamp(1, PAGE_SIZE_MAX);
        let offset = (page - 1) * page_size;
        let total = count_cards(&conn, &request.where_clause, &request.params)?;
        let cards = query_cards(
            &conn,
            &format!(
                "{} ORDER BY datas.id LIMIT {} OFFSET {}",
                sanitize_clause(&request.where_clause),
                page_size,
                offset
            ),
            &request.params,
        )?;
        Ok(SearchCardsPageResponse { cards, total })
    })
}

#[tauri::command]
pub fn query_cards_raw(
    state: State<'_, OpenCdbSessions>,
    request: QueryCardsRequest,
) -> Result<Vec<CardDto>, String> {
    with_session_meta(&state, &request.tab_id, |session| {
        let conn = open_connection(&session.working_path)?;
        query_cards(&conn, &request.query_clause, &request.params)
    })
}

#[tauri::command]
pub fn get_card_by_id(
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    card_id: u32,
) -> Result<Option<CardDto>, String> {
    with_session_meta(&state, &tab_id, |session| {
        let conn = open_connection(&session.working_path)?;
        get_card(&conn, card_id)
    })
}

#[tauri::command]
pub fn modify_cards(
    state: State<'_, OpenCdbSessions>,
    request: ModifyCardsRequest,
) -> Result<(), String> {
    with_session_meta(&state, &request.tab_id, |session| {
        let mut conn = open_connection(&session.working_path)?;
        let tx = conn.transaction().map_err(|err| err.to_string())?;
        {
            let mut stmt_datas = tx
                .prepare(INSERT_DATAS_STMT)
                .map_err(|err| err.to_string())?;
            let mut stmt_texts = tx
                .prepare(INSERT_TEXTS_STMT)
                .map_err(|err| err.to_string())?;
            for card in &request.cards {
                write_card(&mut stmt_datas, &mut stmt_texts, card)?;
            }
        }
        tx.commit().map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn delete_cards(
    state: State<'_, OpenCdbSessions>,
    request: DeleteCardsRequest,
) -> Result<(), String> {
    with_session_meta(&state, &request.tab_id, |session| {
        let mut conn = open_connection(&session.working_path)?;
        let tx = conn.transaction().map_err(|err| err.to_string())?;
        for card_id in &request.card_ids {
            tx.execute("DELETE FROM datas WHERE id = ?", [i64::from(*card_id)])
                .map_err(|err| err.to_string())?;
            tx.execute("DELETE FROM texts WHERE id = ?", [i64::from(*card_id)])
                .map_err(|err| err.to_string())?;
        }
        tx.commit().map_err(|err| err.to_string())
    })
}

#[tauri::command]
pub fn create_cdb_from_cards(request: CreateCdbFromCardsRequest) -> Result<(), String> {
    recreate_cdb_with_cards(Path::new(&request.output_path), &request.cards)
}

#[tauri::command]
pub fn copy_card_assets(request: CopyCardAssetsRequest) -> Result<(), String> {
    let source_dir = cdb_dir_from_path(&request.source_cdb_path)?;
    let target_dir = cdb_dir_from_path(&request.target_cdb_path)?;

    for &card_id in &request.card_ids {
        if request.include_images {
            let _ = copy_if_exists(
                &main_image_path(&source_dir, card_id),
                &main_image_path(&target_dir, card_id),
            )?;
            let _ = copy_if_exists(
                &field_image_path(&source_dir, card_id),
                &field_image_path(&target_dir, card_id),
            )?;
        }

        if request.include_scripts {
            let _ = copy_if_exists(
                &script_path(&source_dir, card_id),
                &script_path(&target_dir, card_id),
            )?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn analyze_cdb_merge(request: AnalyzeCdbMergeRequest) -> Result<AnalyzeCdbMergeResponse, String> {
    analyze_cdb_merge_paths(&request.a_path, &request.b_path)
}

#[tauri::command]
pub fn execute_cdb_merge(request: ExecuteCdbMergeRequest) -> Result<(), String> {
    let analysis = analyze_cdb_merge_paths(&request.a_path, &request.b_path)?;
    if request.conflict_mode == "manual" {
        for conflict in &analysis.conflicts {
            choose_merge_side(&request.conflict_mode, conflict.code, &request.manual_choices)?;
        }
    }

    let a_cards = load_all_cards_from_path(Path::new(&request.a_path))?;
    let b_cards = load_all_cards_from_path(Path::new(&request.b_path))?;
    let a_dir = cdb_dir_from_path(&request.a_path)?;
    let b_dir = cdb_dir_from_path(&request.b_path)?;

    let mut merged_cards = HashMap::<u32, CardDto>::new();
    let mut preferred_side_by_code = HashMap::<u32, MergeSide>::new();

    for card in &a_cards {
        merged_cards.insert(card.code, card.clone());
        preferred_side_by_code.insert(card.code, MergeSide::A);
    }

    for card in &b_cards {
        match merged_cards.get(&card.code) {
            None => {
                merged_cards.insert(card.code, card.clone());
                preferred_side_by_code.insert(card.code, MergeSide::B);
            }
            Some(existing) => {
                let preferred_side = if existing == card {
                    preferred_side_by_code.get(&card.code).copied().unwrap_or(MergeSide::A)
                } else {
                    choose_merge_side(&request.conflict_mode, card.code, &request.manual_choices)?
                };

                if preferred_side == MergeSide::B {
                    merged_cards.insert(card.code, card.clone());
                }
                preferred_side_by_code.insert(card.code, preferred_side);
            }
        }
    }

    let mut merged_cards_list = merged_cards.into_values().collect::<Vec<_>>();
    merged_cards_list.sort_by_key(|card| card.code);

    let output_path = PathBuf::from(&request.output_path);
    ensure_parent_dir(&output_path)?;

    let stage_dir = build_stage_dir(&output_path, "merge")?;
    ensure_dir(&stage_dir)?;
    let output_file_name = output_path
        .file_name()
        .ok_or_else(|| "Unable to resolve output file name".to_string())?;
    let staged_cdb_path = stage_dir.join(output_file_name);

    let staged_pics_dir = stage_dir.join("pics");
    let staged_field_pics_dir = staged_pics_dir.join("field");
    let staged_script_dir = stage_dir.join("script");

    recreate_cdb_with_cards(&staged_cdb_path, &merged_cards_list)?;

    if request.include_images {
        for card in &merged_cards_list {
            let code = card.code;
            let preferred_side = preferred_side_by_code.get(&code).copied().unwrap_or(MergeSide::A);
            let preferred_dir = if preferred_side == MergeSide::A { &a_dir } else { &b_dir };
            let fallback_dir = if preferred_side == MergeSide::A { &b_dir } else { &a_dir };

            let preferred_main = main_image_path(preferred_dir, code);
            let fallback_main = main_image_path(fallback_dir, code);
            let staged_main = staged_pics_dir.join(format!("{code}.jpg"));
            if !copy_if_exists(&preferred_main, &staged_main)? {
                let _ = copy_if_exists(&fallback_main, &staged_main)?;
            }

            let preferred_field = field_image_path(preferred_dir, code);
            let fallback_field = field_image_path(fallback_dir, code);
            let staged_field = staged_field_pics_dir.join(format!("{code}.jpg"));
            if !copy_if_exists(&preferred_field, &staged_field)? && card_has_field_subtype(card) {
                let _ = copy_if_exists(&fallback_field, &staged_field)?;
            }
        }
    }

    if request.include_scripts {
        for card in &merged_cards_list {
            let code = card.code;
            let preferred_side = preferred_side_by_code.get(&code).copied().unwrap_or(MergeSide::A);
            let preferred_dir = if preferred_side == MergeSide::A { &a_dir } else { &b_dir };
            let fallback_dir = if preferred_side == MergeSide::A { &b_dir } else { &a_dir };

            let preferred_script = script_path(preferred_dir, code);
            let fallback_script = script_path(fallback_dir, code);
            let staged_script = staged_script_dir.join(format!("c{code}.lua"));
            if !copy_if_exists(&preferred_script, &staged_script)? {
                let _ = copy_if_exists(&fallback_script, &staged_script)?;
            }
        }
    }

    let output_dir = output_path
        .parent()
        .ok_or_else(|| "Unable to resolve output directory".to_string())?;
    let target_pics_dir = output_dir.join("pics");
    let target_script_dir = output_dir.join("script");
    let backup_cdb_path = output_dir.join(".__dataeditory-merge-backup.cdb");
    let backup_pics_dir = output_dir.join(".__dataeditory-merge-backup-pics");
    let backup_script_dir = output_dir.join(".__dataeditory-merge-backup-script");

    let mut moved_cdb = false;
    let mut moved_pics = false;
    let mut moved_scripts = false;

    let commit_result = (|| -> Result<(), String> {
        if output_path.exists() {
            if backup_cdb_path.exists() {
                fs::remove_file(&backup_cdb_path).map_err(|err| err.to_string())?;
            }
            fs::rename(&output_path, &backup_cdb_path).map_err(|err| err.to_string())?;
        }

        if request.include_images && target_pics_dir.exists() {
            if backup_pics_dir.exists() {
                fs::remove_dir_all(&backup_pics_dir).map_err(|err| err.to_string())?;
            }
            fs::rename(&target_pics_dir, &backup_pics_dir).map_err(|err| err.to_string())?;
        }

        if request.include_scripts && target_script_dir.exists() {
            if backup_script_dir.exists() {
                fs::remove_dir_all(&backup_script_dir).map_err(|err| err.to_string())?;
            }
            fs::rename(&target_script_dir, &backup_script_dir).map_err(|err| err.to_string())?;
        }

        fs::rename(&staged_cdb_path, &output_path).map_err(|err| err.to_string())?;
        moved_cdb = true;

        if request.include_images && staged_pics_dir.exists() {
            fs::rename(&staged_pics_dir, &target_pics_dir).map_err(|err| err.to_string())?;
            moved_pics = true;
        }

        if request.include_scripts && staged_script_dir.exists() {
            fs::rename(&staged_script_dir, &target_script_dir).map_err(|err| err.to_string())?;
            moved_scripts = true;
        }

        Ok(())
    })();

    if let Err(error) = commit_result {
        if moved_scripts {
            let _ = fs::remove_dir_all(&target_script_dir);
        }
        if moved_pics {
            let _ = fs::remove_dir_all(&target_pics_dir);
        }
        if moved_cdb {
            let _ = fs::remove_file(&output_path);
        }
        if backup_cdb_path.exists() {
            let _ = fs::rename(&backup_cdb_path, &output_path);
        }
        if backup_pics_dir.exists() {
            let _ = fs::rename(&backup_pics_dir, &target_pics_dir);
        }
        if backup_script_dir.exists() {
            let _ = fs::rename(&backup_script_dir, &target_script_dir);
        }
        let _ = fs::remove_dir_all(&stage_dir);
        return Err(error);
    }

    if backup_cdb_path.exists() {
        let _ = fs::remove_file(&backup_cdb_path);
    }
    if backup_pics_dir.exists() {
        let _ = fs::remove_dir_all(&backup_pics_dir);
    }
    if backup_script_dir.exists() {
        let _ = fs::remove_dir_all(&backup_script_dir);
    }
    let _ = fs::remove_dir_all(&stage_dir);

    Ok(())
}
