use super::{workspace_replace::*, workspace_search::*};
use crate::{models::cdb::CardDto, test_helpers::make_temp_dir};

fn request(
    card: &CardDto,
    text: &str,
    replacement: &str,
    regex: bool,
    buffer: &str,
) -> WorkspaceReplaceRequest {
    let found = search(
        vec![card.clone()],
        "cards.cdb",
        WorkspaceSearchRequest {
            text: text.into(),
            case_sensitive: false,
            regex,
            search_cards: true,
            search_scripts: true,
            buffers: vec![SearchBuffer {
                card_id: card.code,
                content: buffer.into(),
            }],
        },
    )
    .unwrap();
    let targets = found
        .cards
        .into_iter()
        .chain(found.scripts)
        .flat_map(|group| {
            group.matches.into_iter().map(move |hit| ReplacementTarget {
                card_id: group.card_id,
                script: group.path.is_some(),
                field: hit.field,
                line: hit.line,
                column: hit.column,
                end_column: hit.end_column,
                source_hash: hit.source_hash,
            })
        })
        .collect();
    WorkspaceReplaceRequest {
        text: text.into(),
        replacement: replacement.into(),
        case_sensitive: false,
        regex,
        targets,
        buffers: vec![SearchBuffer {
            card_id: card.code,
            content: buffer.into(),
        }],
    }
}

#[test]
fn only_kept_matches_are_replaced_and_preview_never_writes_files() {
    let dir = make_temp_dir("workspace-replace");
    std::fs::create_dir(dir.join("script")).unwrap();
    std::fs::write(dir.join("script/c10.lua"), "disk hit").unwrap();
    let card = CardDto {
        code: 10,
        name: "hit hit".into(),
        desc: "hit".into(),
        attack: 100,
        strings: vec!["hit".into()],
        ..Default::default()
    };
    let mut input = request(&card, "hit", "$1", false, "😀 hit hit\nhit");
    input.targets.retain(|target| {
        (!target.script && target.field == "name" && target.column == 5)
            || (target.script && target.line == 1 && target.column == 8)
    });
    let output = preview(vec![card], &dir.join("cards.cdb").to_string_lossy(), input).unwrap();
    assert_eq!(output.cards[0].after.name, "hit $1");
    assert_eq!(output.cards[0].after.desc, "hit");
    assert_eq!(output.cards[0].after.attack, 100);
    assert_eq!(output.cards[0].after.strings, ["hit"]);
    assert_eq!(output.scripts[0].after, "😀 hit $1\nhit");
    assert_eq!(output.edits.len(), 2);
    assert_eq!(
        std::fs::read_to_string(dir.join("script/c10.lua")).unwrap(),
        "disk hit"
    );
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn captures_long_matches_and_zero_width_matches_use_full_utf16_locations() {
    let card = CardDto {
        code: 10,
        desc: "😀 hit2 hit3".into(),
        ..Default::default()
    };
    let input = request(&card, r"(?P<n>hit)(\d)", "${n}-$2", true, "");
    let output = preview(vec![card], "cards.cdb", input).unwrap();
    assert_eq!(output.cards[0].after.desc, "😀 hit-2 hit-3");
    let card = CardDto {
        code: 10,
        desc: "x".repeat(200),
        ..Default::default()
    };
    let input = request(&card, "x{200}", "short", true, "");
    assert_eq!(
        preview(vec![card], "cards.cdb", input).unwrap().cards[0]
            .after
            .desc,
        "short"
    );
    let card = CardDto {
        code: 10,
        ..Default::default()
    };
    let mut input = request(&card, "^", "X", true, "😀hit\r\nhit\n");
    input
        .targets
        .retain(|target| target.script && target.line == 2);
    assert_eq!(
        preview(vec![card], "cards.cdb", input).unwrap().scripts[0].after,
        "😀hit\r\nXhit\n"
    );
}

#[test]
fn stale_sources_duplicate_targets_and_unsupported_fields_are_rejected() {
    let card = CardDto {
        code: 10,
        name: "hit".into(),
        ..Default::default()
    };
    let input = request(&card, "hit", "new", false, "");
    let mut changed = card.clone();
    changed.name = "hit edited".into();
    assert_eq!(
        preview(vec![changed], "cards.cdb", input).unwrap_err(),
        "changed"
    );
    let mut input = request(&card, "hit", "new", false, "");
    input.targets.push(input.targets[0].clone());
    assert!(preview(vec![card.clone()], "cards.cdb", input).is_err());
    let mut input = request(&card, "hit", "new", false, "");
    input.targets[0].field = "id".into();
    assert!(preview(vec![card.clone()], "cards.cdb", input).is_err());
    let mut input = request(&card, "hit", "new", false, "");
    input.targets[0].card_id = 99;
    assert_eq!(
        preview(vec![card], "cards.cdb", input).unwrap_err(),
        "changed"
    );
}

#[test]
fn replacement_growth_is_bounded_before_building_a_large_result() {
    let card = CardDto {
        code: 10,
        name: "hit ".repeat(500),
        ..Default::default()
    };
    let input = request(&card, "hit", &"x".repeat(40_000), false, "");
    assert!(preview(vec![card], "cards.cdb", input)
        .unwrap_err()
        .contains("16 MiB"));
}
