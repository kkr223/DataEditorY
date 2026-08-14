use crate::{
    DEFAULT_AI_MAX_STEPS, DEFAULT_AI_MODEL, DEFAULT_AI_TEMPERATURE,
    DEFAULT_PACKAGE_INCLUDE_PATTERNS, DEFAULT_SCRIPT_TEMPLATE,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PersistedAppSettings {
    pub(crate) api_base_url: String,
    pub(crate) model: String,
    pub(crate) temperature: f64,
    pub(crate) agent_max_steps: u32,
    pub(crate) ygopro_path: String,
    pub(crate) script_directory: String,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: bool,
    pub(crate) save_script_image_to_local: bool,
    pub(crate) auto_complete_function_parameters: bool,
    pub(crate) package_include_patterns: Vec<String>,
    pub(crate) shortcut_bindings: HashMap<String, String>,
    pub(crate) encrypted_secret_key: Option<String>,
}

impl Default for PersistedAppSettings {
    fn default() -> Self {
        Self {
            api_base_url: String::new(),
            model: DEFAULT_AI_MODEL.to_string(),
            temperature: DEFAULT_AI_TEMPERATURE,
            agent_max_steps: DEFAULT_AI_MAX_STEPS,
            ygopro_path: String::new(),
            script_directory: String::new(),
            script_template: DEFAULT_SCRIPT_TEMPLATE.to_string(),
            use_external_script_editor: false,
            save_script_image_to_local: false,
            auto_complete_function_parameters: true,
            package_include_patterns: DEFAULT_PACKAGE_INCLUDE_PATTERNS
                .iter()
                .map(|item| item.to_string())
                .collect(),
            shortcut_bindings: HashMap::new(),
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
    pub(crate) agent_max_steps: u32,
    pub(crate) ygopro_path: String,
    pub(crate) script_directory: String,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: bool,
    pub(crate) save_script_image_to_local: bool,
    pub(crate) auto_complete_function_parameters: bool,
    pub(crate) package_include_patterns: Vec<String>,
    pub(crate) shortcut_bindings: HashMap<String, String>,
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
    pub(crate) agent_max_steps: Option<u32>,
    pub(crate) ygopro_path: Option<String>,
    pub(crate) script_directory: Option<String>,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: Option<bool>,
    pub(crate) save_script_image_to_local: Option<bool>,
    pub(crate) auto_complete_function_parameters: Option<bool>,
    pub(crate) package_include_patterns: Option<Vec<String>>,
    pub(crate) shortcut_bindings: Option<HashMap<String, String>>,
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

pub(crate) struct ThrottledProgressEmitter<'a> {
    inner: &'a mut dyn FnMut(TaskProgressPayload),
    task_name: &'a str,
    last_emit: std::time::Instant,
    last_stage: String,
    interval: std::time::Duration,
}

impl<'a> ThrottledProgressEmitter<'a> {
    pub(crate) fn new(task_name: &'a str, inner: &'a mut dyn FnMut(TaskProgressPayload)) -> Self {
        Self {
            inner,
            task_name,
            last_emit: std::time::Instant::now() - std::time::Duration::from_secs(1),
            last_stage: String::new(),
            interval: std::time::Duration::from_millis(100),
        }
    }

    pub(crate) fn emit(&mut self, stage: &str, current: usize, total: usize) {
        let is_final = current >= total;
        let stage_changed = stage != self.last_stage;
        let elapsed = self.last_emit.elapsed() >= self.interval;

        if is_final || stage_changed || elapsed {
            (self.inner)(TaskProgressPayload {
                task: self.task_name.to_string(),
                stage: stage.to_string(),
                current: current as u32,
                total: total as u32,
            });
            self.last_emit = std::time::Instant::now();
            self.last_stage = stage.to_string();
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppendErrorLogRequest {
    pub(crate) source: String,
    pub(crate) message: String,
    pub(crate) stack: Option<String>,
    pub(crate) extra: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::PersistedAppSettings;
    use crate::DEFAULT_AI_MAX_STEPS;

    #[test]
    fn legacy_settings_enable_function_parameter_completion_by_default() {
        let settings: PersistedAppSettings = serde_json::from_str("{}").unwrap();
        assert!(settings.auto_complete_function_parameters);
        assert_eq!(settings.agent_max_steps, DEFAULT_AI_MAX_STEPS);
    }
}
