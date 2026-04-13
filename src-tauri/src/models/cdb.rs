use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

pub type CardDto = ygopro_cdb_encode_rs::CardDataEntry;

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
pub struct GetCardsByIdsRequest {
    pub tab_id: String,
    #[serde(default)]
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
pub struct MergeSourceItemDto {
    pub path: String,
    pub name: String,
    pub project_dir: String,
    pub card_total: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct ExecuteCdbMergeResponse {
    pub output_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectMergeSourcesFromFolderRequest {
    pub directory_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeCdbMergeRequest {
    pub source_paths: Vec<String>,
    #[serde(default)]
    pub include_images: bool,
    #[serde(default)]
    pub include_scripts: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCdbMergeRequest {
    pub source_paths: Vec<String>,
    pub output_dir: String,
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoModifyOperationRequest {
    pub tab_id: String,
    #[serde(default)]
    pub cards_to_restore: Vec<CardDto>,
    #[serde(default)]
    pub ids_to_delete: Vec<u32>,
}
