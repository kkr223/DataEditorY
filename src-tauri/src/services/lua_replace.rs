use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::normalize_script_content;

const MAX_PREVIEW_SNIPPETS_PER_FILE: usize = 5;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaReplaceRequest {
    pub cdb_path: String,
    pub find: String,
    pub replace: String,
    pub regex: bool,
    pub case_sensitive: bool,
    pub include: Option<String>,
    pub exclude: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaReplaceSnippetPreview {
    pub before: String,
    pub after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaReplaceFilePreview {
    pub path: String,
    pub match_count: usize,
    pub snippets: Vec<String>,
    pub diffs: Vec<LuaReplaceSnippetPreview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LuaReplacePreview {
    pub file_count: usize,
    pub match_count: usize,
    pub files: Vec<LuaReplaceFilePreview>,
}

fn script_dir_for_cdb(cdb_path: &str) -> Result<PathBuf, String> {
    let cdb = Path::new(cdb_path);
    let parent = cdb
        .parent()
        .ok_or_else(|| "Unable to resolve the database directory".to_string())?;
    Ok(parent.join("script"))
}

fn collect_lua_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_lua_files(&path, out)?;
            continue;
        }
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lua"))
        {
            out.push(path);
        }
    }
    out.sort();
    Ok(())
}

fn path_matches_filter(path: &Path, filter: &Option<String>) -> bool {
    let Some(filter) = filter
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return true;
    };
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    normalized_path.contains(filter)
}

fn path_excluded(path: &Path, filter: &Option<String>) -> bool {
    let Some(filter) = filter
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    else {
        return false;
    };
    let normalized_path = path.to_string_lossy().replace('\\', "/");
    normalized_path.contains(filter)
}

fn build_regex(request: &LuaReplaceRequest) -> Result<Regex, String> {
    if request.find.is_empty() {
        return Err("Find text cannot be empty".to_string());
    }
    let pattern = if request.regex {
        request.find.clone()
    } else {
        regex::escape(&request.find)
    };
    RegexBuilder::new(&pattern)
        .case_insensitive(!request.case_sensitive)
        .multi_line(true)
        .build()
        .map_err(|err| err.to_string())
}

fn build_snippet(content: &str, start: usize, end: usize) -> String {
    let prefix_start = content[..start]
        .rfind('\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let suffix_end = content[end..]
        .find('\n')
        .map(|index| end + index)
        .unwrap_or(content.len());
    content[prefix_start..suffix_end]
        .trim()
        .chars()
        .take(220)
        .collect()
}

pub(crate) fn preview_lua_replace(request: LuaReplaceRequest) -> Result<LuaReplacePreview, String> {
    let script_dir = script_dir_for_cdb(&request.cdb_path)?;
    let regex = build_regex(&request)?;
    let mut paths = Vec::new();
    collect_lua_files(&script_dir, &mut paths)?;

    let mut files = Vec::new();
    let mut total_matches = 0;
    for path in paths {
        if !path_matches_filter(&path, &request.include) || path_excluded(&path, &request.exclude) {
            continue;
        }
        let content =
            normalize_script_content(fs::read_to_string(&path).map_err(|err| err.to_string())?);
        let mut snippets = Vec::new();
        let mut diffs = Vec::new();
        let mut match_count = 0;
        for capture in regex.find_iter(&content) {
            match_count += 1;
            if snippets.len() < MAX_PREVIEW_SNIPPETS_PER_FILE {
                let before = build_snippet(&content, capture.start(), capture.end());
                let after = regex
                    .replace_all(&before, request.replace.as_str())
                    .to_string();
                snippets.push(before.clone());
                diffs.push(LuaReplaceSnippetPreview { before, after });
            }
        }
        if match_count == 0 {
            continue;
        }
        total_matches += match_count;
        files.push(LuaReplaceFilePreview {
            path: path.to_string_lossy().to_string(),
            match_count,
            snippets,
            diffs,
        });
    }

    Ok(LuaReplacePreview {
        file_count: files.len(),
        match_count: total_matches,
        files,
    })
}

pub(crate) fn apply_lua_replace(request: LuaReplaceRequest) -> Result<LuaReplacePreview, String> {
    let preview = preview_lua_replace(LuaReplaceRequest {
        cdb_path: request.cdb_path.clone(),
        find: request.find.clone(),
        replace: request.replace.clone(),
        regex: request.regex,
        case_sensitive: request.case_sensitive,
        include: request.include.clone(),
        exclude: request.exclude.clone(),
    })?;
    let regex = build_regex(&request)?;

    for file in &preview.files {
        let path = Path::new(&file.path);
        let content =
            normalize_script_content(fs::read_to_string(path).map_err(|err| err.to_string())?);
        let replaced = regex
            .replace_all(&content, request.replace.as_str())
            .to_string();
        fs::write(path, normalize_script_content(replaced)).map_err(|err| err.to_string())?;
    }

    Ok(preview)
}
