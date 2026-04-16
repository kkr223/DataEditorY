use crate::{DEFAULT_AI_MODEL, DEFAULT_AI_TEMPERATURE, DEFAULT_SCRIPT_TEMPLATE};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PersistedAppSettings {
    pub(crate) api_base_url: String,
    pub(crate) model: String,
    pub(crate) temperature: f64,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: bool,
    pub(crate) save_script_image_to_local: bool,
    pub(crate) encrypted_secret_key: Option<String>,
}

impl Default for PersistedAppSettings {
    fn default() -> Self {
        Self {
            api_base_url: String::new(),
            model: DEFAULT_AI_MODEL.to_string(),
            temperature: DEFAULT_AI_TEMPERATURE,
            script_template: DEFAULT_SCRIPT_TEMPLATE.to_string(),
            use_external_script_editor: false,
            save_script_image_to_local: false,
            encrypted_secret_key: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettingsPayload {
    pub(crate) api_base_url: String,
    pub(crate) model: String,
    pub(crate) temperature: f64,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: bool,
    pub(crate) save_script_image_to_local: bool,
    pub(crate) has_secret_key: bool,
    pub(crate) cover_image_path: Option<String>,
    pub(crate) error_log_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveAppSettingsRequest {
    pub(crate) api_base_url: String,
    pub(crate) model: Option<String>,
    pub(crate) temperature: Option<f64>,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: Option<bool>,
    pub(crate) save_script_image_to_local: Option<bool>,
    pub(crate) secret_key: Option<String>,
    pub(crate) clear_secret_key: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardScriptInfo {
    pub(crate) path: String,
    pub(crate) exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardScriptDocument {
    pub(crate) path: String,
    pub(crate) exists: bool,
    pub(crate) content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ZipPackageInfo {
    pub(crate) path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskProgressPayload {
    pub(crate) task: String,
    pub(crate) stage: String,
    pub(crate) current: u32,
    pub(crate) total: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppendErrorLogRequest {
    pub(crate) source: String,
    pub(crate) message: String,
    pub(crate) stack: Option<String>,
    pub(crate) extra: Option<String>,
}
