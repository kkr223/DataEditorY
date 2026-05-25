use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
#[cfg(test)]
use ts_rs::TS;

pub type CardDto = ygopro_cdb_encode_rs::CardDataEntry;

#[cfg(test)]
#[cfg_attr(test, derive(TS))]
#[cfg_attr(test, ts(export_to = "cdb.ts", rename = "CardDataEntry"))]
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDataEntryDto {
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
    #[cfg_attr(test, ts(type = "number"))]
    pub category: u64,
    pub ot: u32,
    pub name: String,
    pub desc: String,
    #[serde(default)]
    pub strings: Vec<String>,
    pub lscale: u32,
    pub rscale: u32,
    pub link_marker: u32,
    pub rule_code: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct SearchCardsPageRequest {
    pub tab_id: String,
    pub where_clause: String,
    #[serde(default)]
    #[cfg_attr(test, ts(type = "{ [key in string]?: string | number }"))]
    pub params: HashMap<String, JsonValue>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct SearchCardsPageResponse {
    #[cfg_attr(test, ts(as = "Vec<CardDataEntryDto>"))]
    pub cards: Vec<CardDto>,
    pub total: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct QueryCardsRequest {
    pub tab_id: String,
    pub query_clause: String,
    #[serde(default)]
    #[cfg_attr(test, ts(type = "{ [key in string]?: string | number }"))]
    pub params: HashMap<String, JsonValue>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct OpenCdbTabResponse {
    pub name: String,
    #[cfg_attr(test, ts(as = "Vec<CardDataEntryDto>"))]
    pub cached_cards: Vec<CardDto>,
    pub cached_total: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct ModifyCardsRequest {
    pub tab_id: String,
    #[cfg_attr(test, ts(as = "Vec<CardDataEntryDto>"))]
    pub cards: Vec<CardDto>,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct DeleteCardsRequest {
    pub tab_id: String,
    pub card_ids: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct GetCardsByIdsRequest {
    pub tab_id: String,
    #[serde(default)]
    pub card_ids: Vec<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct CreateCdbFromCardsRequest {
    pub output_path: String,
    #[cfg_attr(test, ts(as = "Vec<CardDataEntryDto>"))]
    pub cards: Vec<CardDto>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct MergeSourceItemDto {
    pub path: String,
    pub name: String,
    pub project_dir: String,
    pub card_total: u32,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct MergeSourcePlanDto {
    pub path: String,
    pub name: String,
    pub card_total: u32,
    pub winning_card_count: u32,
    pub winning_main_image_count: u32,
    pub winning_field_image_count: u32,
    pub winning_script_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct AnalyzeCdbMergeResponse {
    pub source_count: u32,
    pub merged_total: u32,
    pub duplicate_card_total: u32,
    pub main_image_total: u32,
    pub field_image_total: u32,
    pub script_total: u32,
    pub sources: Vec<MergeSourcePlanDto>,
}

#[derive(Debug, Clone, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct ExecuteCdbMergeResponse {
    pub output_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct CollectMergeSourcesFromFolderRequest {
    pub directory_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct AnalyzeCdbMergeRequest {
    pub source_paths: Vec<String>,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct ExecuteCdbMergeRequest {
    pub source_paths: Vec<String>,
    pub output_dir: String,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct CopyCardAssetsRequest {
    pub source_cdb_path: String,
    pub target_cdb_path: String,
    pub card_ids: Vec<u32>,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "cdb.ts"))]
pub struct UndoModifyOperationRequest {
    pub tab_id: String,
    #[serde(default)]
    #[cfg_attr(test, ts(as = "Vec<CardDataEntryDto>"))]
    pub cards_to_restore: Vec<CardDto>,
    #[serde(default)]
    pub ids_to_delete: Vec<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    const GENERATED_CDB_TYPESCRIPT_PATH: &str = "../src/lib/types/generated/cdb.ts";
    const UPDATE_CDB_TS_BINDINGS_ENV: &str = "UPDATE_CDB_TS_BINDINGS";

    fn unique_export_dir() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dataeditory-cdb-bindings-{}-{timestamp}",
            std::process::id(),
        ))
    }

    fn export_cdb_typescript_bindings(out_dir: &Path) -> String {
        if out_dir.exists() {
            fs::remove_dir_all(out_dir).expect("remove stale TypeScript export dir");
        }
        fs::create_dir_all(out_dir).expect("create TypeScript export dir");

        CardDataEntryDto::export_all_to(out_dir).expect("export card data entry binding");
        SearchCardsPageRequest::export_all_to(out_dir)
            .expect("export search cards page request binding");
        SearchCardsPageResponse::export_all_to(out_dir)
            .expect("export search cards page response binding");
        QueryCardsRequest::export_all_to(out_dir).expect("export query cards request binding");
        OpenCdbTabResponse::export_all_to(out_dir).expect("export open cdb tab response binding");
        ModifyCardsRequest::export_all_to(out_dir).expect("export modify cards request binding");
        DeleteCardsRequest::export_all_to(out_dir).expect("export delete cards request binding");
        GetCardsByIdsRequest::export_all_to(out_dir)
            .expect("export get cards by ids request binding");
        CreateCdbFromCardsRequest::export_all_to(out_dir)
            .expect("export create cdb from cards request binding");
        MergeSourceItemDto::export_all_to(out_dir).expect("export merge source item binding");
        MergeSourcePlanDto::export_all_to(out_dir).expect("export merge source plan binding");
        AnalyzeCdbMergeResponse::export_all_to(out_dir)
            .expect("export analyze merge response binding");
        ExecuteCdbMergeResponse::export_all_to(out_dir)
            .expect("export execute merge response binding");
        CollectMergeSourcesFromFolderRequest::export_all_to(out_dir)
            .expect("export collect merge sources request binding");
        AnalyzeCdbMergeRequest::export_all_to(out_dir)
            .expect("export analyze merge request binding");
        ExecuteCdbMergeRequest::export_all_to(out_dir)
            .expect("export execute merge request binding");
        CopyCardAssetsRequest::export_all_to(out_dir).expect("export copy card assets binding");
        UndoModifyOperationRequest::export_all_to(out_dir)
            .expect("export undo modify operation request binding");

        fs::read_to_string(out_dir.join("cdb.ts")).expect("read generated cdb binding")
    }

    fn normalize_newlines(value: &str) -> String {
        value.replace("\r\n", "\n")
    }

    #[test]
    fn generated_cdb_types_are_current() {
        let out_dir = unique_export_dir();
        let generated = export_cdb_typescript_bindings(&out_dir);
        let target_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(GENERATED_CDB_TYPESCRIPT_PATH);

        if std::env::var_os(UPDATE_CDB_TS_BINDINGS_ENV).is_some() {
            fs::create_dir_all(
                target_path
                    .parent()
                    .expect("generated binding path should have a parent"),
            )
            .expect("create generated binding directory");
            fs::write(&target_path, &generated).expect("update generated cdb binding");
        }

        let actual = fs::read_to_string(&target_path).expect("read committed cdb binding");
        assert_eq!(
            normalize_newlines(&actual),
            generated,
            "Rust CDB DTO TypeScript binding is stale. Re-run this test with {UPDATE_CDB_TS_BINDINGS_ENV}=1 to update it.",
        );

        fs::remove_dir_all(out_dir).expect("remove TypeScript export dir");
    }

    #[test]
    fn card_data_entry_binding_matches_card_dto_json_shape() {
        let card = CardDto {
            code: 12_345,
            alias: 0,
            setcode: vec![0x123, 0x456],
            type_: 0x1,
            attack: -2,
            defense: 2500,
            level: 4,
            race: 8192,
            attribute: 16,
            category: 0x1_0000_0000,
            ot: 3,
            name: "Sample".to_string(),
            desc: "Description".to_string(),
            strings: vec!["alpha".to_string(), "beta".to_string()],
            lscale: 1,
            rscale: 9,
            link_marker: 0,
            rule_code: 54_321,
        };
        let binding_card = CardDataEntryDto {
            code: card.code,
            alias: card.alias,
            setcode: card.setcode.clone(),
            type_: card.type_,
            attack: card.attack,
            defense: card.defense,
            level: card.level,
            race: card.race,
            attribute: card.attribute,
            category: card.category,
            ot: card.ot,
            name: card.name.clone(),
            desc: card.desc.clone(),
            strings: card.strings.clone(),
            lscale: card.lscale,
            rscale: card.rscale,
            link_marker: card.link_marker,
            rule_code: card.rule_code,
        };

        assert_eq!(
            serde_json::to_value(&card).expect("serialize card dto"),
            serde_json::to_value(&binding_card).expect("serialize binding card dto"),
        );
    }
}
