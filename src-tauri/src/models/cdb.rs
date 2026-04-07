use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

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
