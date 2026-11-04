use std::{
    collections::HashMap,
    fs,
    io::{ErrorKind, Read},
    path::Path,
};

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::cdb::CardDto;

const MATCH_LIMIT: usize = 500;
const SCRIPT_SIZE_LIMIT: u64 = 4 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchBuffer {
    pub card_id: u32,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchRequest {
    pub text: String,
    pub case_sensitive: bool,
    pub regex: bool,
    pub search_cards: bool,
    pub search_scripts: bool,
    #[serde(default)]
    pub buffers: Vec<SearchBuffer>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub field: String,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
    pub before: String,
    pub matched: String,
    pub after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchGroup {
    pub card_id: u32,
    pub card_name: String,
    pub path: Option<String>,
    pub matches: Vec<SearchMatch>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResult {
    pub cards: Vec<SearchGroup>,
    pub scripts: Vec<SearchGroup>,
    pub limited: bool,
    pub warnings: Vec<String>,
}

fn collect_matches(
    regex: &Regex,
    content: &str,
    field: &str,
    count: &mut usize,
    limited: &mut bool,
) -> Vec<SearchMatch> {
    let mut matches = Vec::new();
    for (index, line) in content.lines().enumerate() {
        for found in regex.find_iter(line) {
            if *count >= MATCH_LIMIT {
                *count = MATCH_LIMIT + 1;
                *limited = true;
                return matches;
            }
            let prefix = &line[..found.start()];
            let suffix = &line[found.end()..];
            let mut before = prefix.chars().rev().take(70).collect::<Vec<_>>();
            before.reverse();
            let before: String = before.into_iter().collect();
            matches.push(SearchMatch {
                field: field.to_string(),
                line: index + 1,
                column: prefix.encode_utf16().count() + 1,
                end_column: line[..found.end()].encode_utf16().count() + 1,
                before: if prefix.chars().count() > 70 {
                    format!("…{before}")
                } else {
                    before
                },
                matched: found.as_str().chars().take(120).collect(),
                after: suffix.chars().take(100).collect(),
            });
            *count += 1;
        }
    }
    matches
}

fn card_fields(card: &CardDto) -> Result<Vec<(String, String)>, String> {
    let Value::Object(fields) = serde_json::to_value(card).map_err(|err| err.to_string())? else {
        return Ok(Vec::new());
    };
    let mut result = Vec::new();
    for (field, value) in fields {
        let field = match field.as_str() {
            "code" => "id",
            "attack" => "atk",
            "defense" => "def",
            other => other,
        };
        if let Value::Array(values) = value {
            for (index, value) in values.into_iter().enumerate() {
                let label = if field == "strings" {
                    format!("str{}", index + 1)
                } else {
                    format!("{field}[{index}]")
                };
                result.push((
                    label,
                    value
                        .as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| value.to_string()),
                ));
            }
        } else {
            result.push((
                field.to_string(),
                value
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| value.to_string()),
            ));
        }
    }
    Ok(result)
}

fn read_script(path: &Path) -> Result<Option<String>, String> {
    let file = match fs::File::open(path) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        other => other.map_err(|error| error.to_string())?,
    };
    if file.metadata().map_err(|error| error.to_string())?.len() > SCRIPT_SIZE_LIMIT {
        return Err("Script exceeds 4 MiB".into());
    }
    let mut content = String::new();
    file.take(SCRIPT_SIZE_LIMIT + 1)
        .read_to_string(&mut content)
        .map_err(|error| error.to_string())?;
    if content.len() as u64 > SCRIPT_SIZE_LIMIT {
        return Err("Script exceeds 4 MiB".into());
    }
    Ok(Some(crate::normalize_script_content(content)))
}

pub fn search(
    cards: Vec<CardDto>,
    cdb_path: &str,
    request: WorkspaceSearchRequest,
) -> Result<WorkspaceSearchResult, String> {
    if request.text.is_empty() {
        return Err("Search text cannot be empty".to_string());
    }
    let pattern = if request.regex {
        request.text
    } else {
        regex::escape(&request.text)
    };
    let regex = RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .size_limit(2 * 1024 * 1024)
        .build()
        .map_err(|err| err.to_string())?;
    let buffers: HashMap<_, _> = request
        .buffers
        .into_iter()
        .map(|buffer| (buffer.card_id, buffer.content))
        .collect();
    let mut result = WorkspaceSearchResult::default();
    let mut card_count = 0;
    let mut script_count = 0;
    for card in cards {
        if request.search_cards && card_count <= MATCH_LIMIT {
            let mut matches = Vec::new();
            for (field, value) in card_fields(&card)? {
                matches.extend(collect_matches(
                    &regex,
                    &value,
                    &field,
                    &mut card_count,
                    &mut result.limited,
                ));
                if card_count > MATCH_LIMIT {
                    break;
                }
            }
            if !matches.is_empty() {
                result.cards.push(SearchGroup {
                    card_id: card.code,
                    card_name: card.name.clone(),
                    path: None,
                    matches,
                });
            }
        }
        if !request.search_scripts || script_count > MATCH_LIMIT {
            continue;
        }
        let path = match crate::build_card_script_path(cdb_path, card.code) {
            Ok(path) => path,
            Err(error) => {
                if result.warnings.len() < 20 {
                    result.warnings.push(error);
                }
                continue;
            }
        };
        let content = if let Some(content) = buffers.get(&card.code) {
            Some(content.clone())
        } else {
            match read_script(&path) {
                Ok(content) => content,
                Err(err) => {
                    if result.warnings.len() < 20 {
                        result.warnings.push(format!("{}: {err}", path.display()));
                    }
                    None
                }
            }
        };
        let Some(content) = content else {
            continue;
        };
        let matches = collect_matches(&regex, &content, "", &mut script_count, &mut result.limited);
        if !matches.is_empty() {
            result.scripts.push(SearchGroup {
                card_id: card.code,
                card_name: card.name,
                path: Some(path.to_string_lossy().to_string()),
                matches,
            });
        }
    }
    Ok(result)
}
