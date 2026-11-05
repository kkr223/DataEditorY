use std::collections::{BTreeMap, HashMap};

use regex::Regex;
use serde::{Deserialize, Serialize};

use super::workspace_search::{build_regex, content_hash, read_script, SearchBuffer};
use crate::models::cdb::CardDto;

const PREVIEW_SIZE_LIMIT: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementTarget {
    pub card_id: u32,
    pub script: bool,
    pub field: String,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
    pub source_hash: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReplaceRequest {
    pub text: String,
    pub case_sensitive: bool,
    pub regex: bool,
    pub replacement: String,
    pub targets: Vec<ReplacementTarget>,
    #[serde(default)]
    pub buffers: Vec<SearchBuffer>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardTextChange {
    pub before: CardDto,
    pub after: CardDto,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTextChange {
    pub card_id: u32,
    pub card_name: String,
    pub path: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementEdit {
    pub target: ReplacementTarget,
    pub replacement: String,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceReplacePreview {
    pub cards: Vec<CardTextChange>,
    pub scripts: Vec<ScriptTextChange>,
    pub edits: Vec<ReplacementEdit>,
}

fn replace_content(
    content: &str,
    selections: &[&ReplacementTarget],
    regex: &Regex,
    request: &WorkspaceReplaceRequest,
    edits: &mut Vec<ReplacementEdit>,
) -> Result<String, String> {
    let hash = content_hash(content);
    let mut pending = BTreeMap::new();
    for target in selections {
        if target.source_hash != hash {
            return Err("changed".into());
        }
        if pending
            .insert((target.line, target.column, target.end_column), *target)
            .is_some()
        {
            return Err("Duplicate replacement target".into());
        }
    }
    let mut replacements = Vec::new();
    let mut after_size = content.len();
    let mut offset = 0;
    for (index, line) in content.lines().enumerate() {
        for captures in regex.captures_iter(line) {
            let found = captures.get(0).unwrap();
            let key = (
                index + 1,
                line[..found.start()].encode_utf16().count() + 1,
                line[..found.end()].encode_utf16().count() + 1,
            );
            let Some(target) = pending.remove(&key) else {
                continue;
            };
            if request.regex
                && request
                    .replacement
                    .matches('$')
                    .count()
                    .saturating_mul(found.len())
                    .saturating_add(request.replacement.len())
                    > PREVIEW_SIZE_LIMIT
            {
                return Err("Replacement preview exceeds 16 MiB; narrow the search".into());
            }
            let mut replacement = String::new();
            if request.regex {
                captures.expand(&request.replacement, &mut replacement);
            } else {
                replacement.clone_from(&request.replacement);
            }
            if found.as_str() == replacement {
                continue;
            }
            after_size = after_size
                .saturating_sub(found.len())
                .saturating_add(replacement.len());
            if after_size > PREVIEW_SIZE_LIMIT {
                return Err("Replacement preview exceeds 16 MiB; narrow the search".into());
            }
            replacements.push((
                offset + found.start(),
                offset + found.end(),
                replacement.clone(),
            ));
            edits.push(ReplacementEdit {
                target: target.clone(),
                replacement,
            });
        }
        offset += line.len();
        if content.as_bytes().get(offset) == Some(&b'\r') {
            offset += 1;
        }
        if content.as_bytes().get(offset) == Some(&b'\n') {
            offset += 1;
        }
    }
    if !pending.is_empty() {
        return Err("changed".into());
    }
    let mut after = content.to_owned();
    for (start, end, replacement) in replacements.into_iter().rev() {
        after.replace_range(start..end, &replacement);
    }
    Ok(after)
}

pub fn preview(
    cards: Vec<CardDto>,
    cdb_path: &str,
    request: WorkspaceReplaceRequest,
) -> Result<WorkspaceReplacePreview, String> {
    if request.targets.len() > 1000 {
        return Err("Too many replacement targets".into());
    }
    let regex = build_regex(&request.text, request.case_sensitive, request.regex)?;
    let cards: HashMap<_, _> = cards.into_iter().map(|card| (card.code, card)).collect();
    let buffers: HashMap<_, _> = request
        .buffers
        .iter()
        .map(|buffer| (buffer.card_id, &buffer.content))
        .collect();
    let mut groups: BTreeMap<_, Vec<_>> = BTreeMap::new();
    for target in &request.targets {
        if (!target.script && !["name", "desc"].contains(&target.field.as_str()))
            || (target.script && !target.field.is_empty())
        {
            return Err("Unsupported replacement field".into());
        }
        groups
            .entry((target.card_id, target.script))
            .or_default()
            .push(target);
    }
    let mut result = WorkspaceReplacePreview::default();
    let mut size = 0;
    for ((card_id, script), targets) in groups {
        let card = cards.get(&card_id).ok_or("changed")?;
        if script {
            let path = crate::build_card_script_path(cdb_path, card_id)?;
            let before = if let Some(buffer) = buffers.get(&card_id) {
                (*buffer).clone()
            } else {
                read_script(&path)?.ok_or("changed")?
            };
            let after = replace_content(&before, &targets, &regex, &request, &mut result.edits)?;
            if after == before {
                continue;
            }
            size += before.len() + after.len();
            result.scripts.push(ScriptTextChange {
                card_id,
                card_name: card.name.clone(),
                path: path.to_string_lossy().to_string(),
                before,
                after,
            });
        } else {
            let mut after = card.clone();
            for field in ["name", "desc"] {
                let selected: Vec<_> = targets
                    .iter()
                    .copied()
                    .filter(|target| target.field == field)
                    .collect();
                if selected.is_empty() {
                    continue;
                }
                let text = if field == "name" {
                    &card.name
                } else {
                    &card.desc
                };
                let replaced =
                    replace_content(text, &selected, &regex, &request, &mut result.edits)?;
                if field == "name" {
                    after.name = replaced;
                } else {
                    after.desc = replaced;
                }
            }
            if after.name == card.name && after.desc == card.desc {
                continue;
            }
            size += card.name.len()
                + card.desc.len()
                + after.name.len()
                + after.desc.len()
                + card.strings.iter().map(String::len).sum::<usize>() * 2;
            result.cards.push(CardTextChange {
                before: card.clone(),
                after,
            });
        }
        if size > PREVIEW_SIZE_LIMIT {
            return Err("Replacement preview exceeds 16 MiB; narrow the search".into());
        }
    }
    Ok(result)
}
