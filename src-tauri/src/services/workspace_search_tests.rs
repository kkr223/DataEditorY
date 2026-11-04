use super::workspace_search::*;
use crate::{models::cdb::CardDto, test_helpers::make_temp_dir};

fn request(text: &str) -> WorkspaceSearchRequest {
    WorkspaceSearchRequest {
        text: text.into(),
        case_sensitive: false,
        regex: false,
        search_cards: true,
        search_scripts: true,
        buffers: vec![],
    }
}

#[test]
fn searches_all_fields_and_only_scripts_owned_by_cdb_card_ids() {
    let dir = make_temp_dir("workspace-search");
    std::fs::create_dir(dir.join("script")).unwrap();
    std::fs::write(dir.join("script/c10.lua"), "-- alpha\nlocal a = 'Alpha'").unwrap();
    std::fs::write(dir.join("script/c99.lua"), "alpha").unwrap();
    let card = CardDto {
        code: 10,
        name: "Alpha Card".into(),
        strings: vec!["alpha hint".into()],
        attack: 2300,
        ..Default::default()
    };
    let path = dir.join("cards.cdb").to_string_lossy().to_string();
    let result = search(vec![card.clone()], &path, request("alpha")).unwrap();
    assert_eq!(result.cards.len(), 1);
    assert_eq!(result.cards[0].matches.len(), 2);
    assert!(result.cards[0]
        .matches
        .iter()
        .any(|item| item.field == "str1"));
    assert_eq!(result.scripts.len(), 1);
    assert_eq!(result.scripts[0].matches[1].line, 2);
    let result = search(vec![card], &path, request("2300")).unwrap();
    assert_eq!(result.cards[0].matches[0].field, "atk");
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn open_buffers_override_disk_and_columns_are_utf16() {
    let dir = make_temp_dir("workspace-search-buffers");
    let path = dir.join("cards.cdb").to_string_lossy().to_string();
    let mut input = request("needle");
    input.buffers = vec![
        SearchBuffer {
            card_id: 10,
            content: "-- 😀针 needle\r\nneedle".into(),
        },
        SearchBuffer {
            card_id: 99,
            content: "needle".into(),
        },
    ];
    let result = search(
        vec![CardDto {
            code: 10,
            ..Default::default()
        }],
        &path,
        input,
    )
    .unwrap();
    assert_eq!(result.scripts.len(), 1);
    assert_eq!(result.scripts[0].matches[0].column, 8);
    assert_eq!(result.scripts[0].matches[0].end_column, 14);
    assert_eq!(result.scripts[0].matches[1].line, 2);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn regex_case_sensitivity_and_limits_are_independent_per_category() {
    let card = CardDto {
        code: 10,
        desc: "hit ".repeat(600),
        ..Default::default()
    };
    let mut input = request("HIT");
    input.case_sensitive = true;
    assert!(search(vec![card.clone()], "cards.cdb", input)
        .unwrap()
        .cards
        .is_empty());
    let mut input = request("h.t");
    input.regex = true;
    input.buffers = vec![SearchBuffer {
        card_id: 10,
        content: "hit ".repeat(600),
    }];
    let result = search(vec![card], "cards.cdb", input).unwrap();
    assert!(result.limited);
    assert_eq!(result.cards[0].matches.len(), 500);
    assert_eq!(result.scripts[0].matches.len(), 500);
    let mut input = request("[");
    input.regex = true;
    assert!(search(vec![], "cards.cdb", input).is_err());
}

#[test]
fn unreadable_scripts_report_a_warning_instead_of_losing_card_results() {
    let dir = make_temp_dir("workspace-search-invalid");
    std::fs::create_dir(dir.join("script")).unwrap();
    std::fs::write(dir.join("script/c10.lua"), [0xff, 0xfe]).unwrap();
    let path = dir.join("cards.cdb").to_string_lossy().to_string();
    let result = search(
        vec![CardDto {
            code: 10,
            name: "needle".into(),
            ..Default::default()
        }],
        &path,
        request("needle"),
    )
    .unwrap();
    assert_eq!(result.cards.len(), 1);
    assert_eq!(result.warnings.len(), 1);
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn a_database_without_a_source_directory_can_still_search_card_fields() {
    let result = search(
        vec![CardDto {
            code: 10,
            name: "needle".into(),
            ..Default::default()
        }],
        "",
        request("needle"),
    )
    .unwrap();
    assert_eq!(result.cards.len(), 1);
    assert_eq!(result.warnings.len(), 1);
}
