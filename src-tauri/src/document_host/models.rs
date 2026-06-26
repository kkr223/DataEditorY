use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::cdb::CardDto;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOpenRequest {
    pub provider_id: String,
    pub document_id: String,
    pub type_id: String,
    pub source_uri: Option<String>,
    #[serde(default)]
    pub create: bool,
    pub input: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOpenResponse {
    pub title: String,
    pub metadata: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderQueryRequest {
    pub provider_id: String,
    pub document_id: String,
    pub query: CardCollectionQuery,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderExecuteRequest {
    pub provider_id: String,
    pub document_id: String,
    pub command: CardCollectionCommand,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderDocumentRequest {
    pub provider_id: String,
    pub document_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSaveRequest {
    pub provider_id: String,
    pub document_id: String,
    pub destination_uri: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSaveResponse {
    pub source_uri: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCommandResult {
    pub changed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodecExportRequest {
    pub codec_id: String,
    pub document_id: Option<String>,
    pub source_uri: Option<String>,
    pub destination_uri: String,
    pub options: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CardCollectionQuery {
    Search {
        expression: CardSearchExpression,
        page: u32,
        page_size: u32,
    },
    GetById {
        card_id: u32,
    },
    GetByIds {
        card_ids: Vec<u32>,
    },
    FindByNames {
        names: Vec<String>,
    },
    All,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardSearchPage {
    pub cards: Vec<CardDto>,
    pub total: u32,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum CardCollectionCommand {
    Upsert { cards: Vec<CardDto> },
    Delete { card_ids: Vec<u32> },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CardSearchExpression {
    All,
    And {
        expressions: Vec<CardSearchExpression>,
    },
    Or {
        expressions: Vec<CardSearchExpression>,
    },
    Not {
        expression: Box<CardSearchExpression>,
    },
    TextContains {
        field: TextField,
        value: String,
    },
    OrderedTextContains {
        field: TextField,
        values: Vec<String>,
    },
    IdPrefix {
        value: String,
    },
    Compare {
        field: NumericField,
        operator: CompareOperator,
        value: i64,
    },
    MaskContains {
        field: MaskField,
        value: i64,
    },
    MaskExcludes {
        field: MaskField,
        value: i64,
    },
    SetcodeContains {
        value: i64,
    },
    InIds {
        values: Vec<u32>,
    },
    RuleCompare {
        left: CardRuleOperand,
        operator: CompareOperator,
        right: CardRuleOperand,
    },
    RuleMaskContains {
        field: MaskField,
        operand: CardRuleOperand,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CardRuleOperand {
    Field { field: NumericField },
    Value { value: i64 },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextField {
    Name,
    Desc,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NumericField {
    Id,
    Alias,
    Atk,
    Def,
    Level,
    Ot,
    Lscale,
    Rscale,
    Attribute,
    Race,
    Type,
    LinkMarker,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MaskField {
    Attribute,
    Race,
    Type,
    LinkMarker,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompareOperator {
    Eq,
    Ne,
    Gt,
    Gte,
    Lt,
    Lte,
}

#[cfg(test)]
mod tests {
    use super::{CardCollectionCommand, CardCollectionQuery};
    use serde_json::json;

    #[test]
    fn card_collection_query_accepts_frontend_camel_case_fields() {
        let search: CardCollectionQuery = serde_json::from_value(json!({
            "kind": "search",
            "expression": { "kind": "all" },
            "page": 1,
            "pageSize": 50
        }))
        .expect("search query should deserialize");
        assert!(matches!(
            search,
            CardCollectionQuery::Search { page_size: 50, .. }
        ));

        let get_by_id: CardCollectionQuery = serde_json::from_value(json!({
            "kind": "getById",
            "cardId": 483
        }))
        .expect("getById query should deserialize");
        assert!(matches!(
            get_by_id,
            CardCollectionQuery::GetById { card_id: 483 }
        ));

        let get_by_ids: CardCollectionQuery = serde_json::from_value(json!({
            "kind": "getByIds",
            "cardIds": [483, 2511]
        }))
        .expect("getByIds query should deserialize");
        assert!(
            matches!(get_by_ids, CardCollectionQuery::GetByIds { card_ids } if card_ids.len() == 2)
        );
    }

    #[test]
    fn card_collection_command_accepts_frontend_camel_case_fields() {
        let delete: CardCollectionCommand = serde_json::from_value(json!({
            "kind": "delete",
            "cardIds": [483]
        }))
        .expect("delete command should deserialize");
        assert!(
            matches!(delete, CardCollectionCommand::Delete { card_ids } if card_ids == vec![483])
        );
    }
}
