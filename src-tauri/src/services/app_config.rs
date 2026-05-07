use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::{
    AppSettingsPayload, PersistedAppSettings, CUSTOM_COVER_FILE_NAME, DEFAULT_AI_MODEL,
    DEFAULT_AI_TEMPERATURE, DEFAULT_PACKAGE_INCLUDE_PATTERNS, DEFAULT_SCRIPT_TEMPLATE,
    ERROR_LOG_FILE_NAME, LOGS_DIR_NAME, SETTINGS_FILE_NAME,
};

const LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS: &[&str] = &[
    "pics/{code}.jpg",
    "pics/field/{code}.jpg",
    "script/{code}.lua",
    "strings.conf",
    "lflist.conf",
];
const LEGACY_DEFAULT_SCRIPT_TEMPLATE: &str =
    "-- {卡名}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n";

pub(crate) fn ensure_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

pub(crate) fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(SETTINGS_FILE_NAME))
}

pub(crate) fn custom_cover_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(CUSTOM_COVER_FILE_NAME))
}

pub(crate) fn logs_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(LOGS_DIR_NAME))
}

pub(crate) fn error_log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = logs_dir_path(app)?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = dir.join(ERROR_LOG_FILE_NAME);
    if !path.exists() {
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|err| err.to_string())?;
    }
    Ok(path)
}

pub(crate) fn load_persisted_settings(app: &AppHandle) -> Result<PersistedAppSettings, String> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(PersistedAppSettings::default());
    }

    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let mut settings =
        serde_json::from_str::<PersistedAppSettings>(&content).map_err(|err| err.to_string())?;

    if settings.model.trim().is_empty() {
        settings.model = DEFAULT_AI_MODEL.to_string();
    }
    settings.script_template = normalize_script_template(settings.script_template);
    settings.package_include_patterns =
        normalize_package_include_patterns(Some(settings.package_include_patterns));
    settings.temperature = normalize_temperature(Some(settings.temperature));

    Ok(settings)
}

pub(crate) fn save_persisted_settings(
    app: &AppHandle,
    settings: &PersistedAppSettings,
) -> Result<(), String> {
    let path = settings_file_path(app)?;
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

pub(crate) fn normalize_base_url(value: String) -> String {
    value.trim().trim_end_matches('/').to_string()
}

pub(crate) fn normalize_model(value: Option<String>) -> String {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| DEFAULT_AI_MODEL.to_string())
}

pub(crate) fn normalize_script_template(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() || value == LEGACY_DEFAULT_SCRIPT_TEMPLATE {
        DEFAULT_SCRIPT_TEMPLATE.to_string()
    } else {
        value.replace("\r\n", "\n")
    }
}

pub(crate) fn normalize_script_content(value: String) -> String {
    value.replace("\r\n", "\n")
}

pub(crate) fn normalize_temperature(value: Option<f64>) -> f64 {
    match value {
        Some(item) if item.is_finite() => item.clamp(0.0, 2.0),
        _ => DEFAULT_AI_TEMPERATURE,
    }
}

pub(crate) fn normalize_package_include_patterns(value: Option<Vec<String>>) -> Vec<String> {
    let mut seen = HashSet::new();
    let patterns = value
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().replace('\\', "/"))
        .filter(|item| !item.is_empty())
        .filter(|item| seen.insert(item.clone()))
        .collect::<Vec<_>>();

    if patterns.is_empty()
        || patterns
            .iter()
            .map(String::as_str)
            .eq(LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS.iter().copied())
    {
        DEFAULT_PACKAGE_INCLUDE_PATTERNS
            .iter()
            .map(|item| item.to_string())
            .collect()
    } else {
        patterns
    }
}

pub(crate) fn to_settings_payload(
    app: &AppHandle,
    settings: PersistedAppSettings,
) -> Result<AppSettingsPayload, String> {
    let cover_path = custom_cover_path(app)?;
    Ok(AppSettingsPayload {
        api_base_url: settings.api_base_url,
        model: if settings.model.trim().is_empty() {
            DEFAULT_AI_MODEL.to_string()
        } else {
            settings.model
        },
        temperature: normalize_temperature(Some(settings.temperature)),
        script_template: normalize_script_template(settings.script_template),
        use_external_script_editor: settings.use_external_script_editor,
        save_script_image_to_local: settings.save_script_image_to_local,
        package_include_patterns: normalize_package_include_patterns(Some(
            settings.package_include_patterns,
        )),
        has_secret_key: settings.encrypted_secret_key.is_some(),
        cover_image_path: if cover_path.exists() {
            Some(cover_path.to_string_lossy().to_string())
        } else {
            None
        },
        error_log_path: error_log_path(app)?.to_string_lossy().to_string(),
    })
}

pub(crate) fn now_local_timestamp() -> String {
    chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string()
}

pub(crate) fn build_card_script_path(cdb_path: &str, card_id: u32) -> Result<PathBuf, String> {
    let cdb_path = Path::new(cdb_path);
    let cdb_dir = cdb_path
        .parent()
        .ok_or_else(|| "Unable to resolve the database directory".to_string())?;
    Ok(cdb_dir.join("script").join(format!("c{card_id}.lua")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DEFAULT_AI_MODEL, DEFAULT_AI_TEMPERATURE, DEFAULT_SCRIPT_TEMPLATE};

    #[test]
    fn normalizes_settings_fields() {
        assert_eq!(
            normalize_base_url(" https://api.openai.com/v1/ ".to_string()),
            "https://api.openai.com/v1"
        );
        assert_eq!(normalize_model(Some("".to_string())), DEFAULT_AI_MODEL);
        assert_eq!(normalize_temperature(Some(5.0)), 2.0);
        assert_eq!(normalize_temperature(Some(-1.0)), 0.0);
        assert_eq!(
            normalize_temperature(Some(f64::NAN)),
            DEFAULT_AI_TEMPERATURE
        );
        assert_eq!(
            normalize_script_template("line1\r\nline2".to_string()),
            "line1\nline2"
        );
        assert_eq!(
            normalize_script_template("   ".to_string()),
            DEFAULT_SCRIPT_TEMPLATE
        );
        assert_eq!(
            normalize_script_template(LEGACY_DEFAULT_SCRIPT_TEMPLATE.to_string()),
            DEFAULT_SCRIPT_TEMPLATE
        );
        assert_eq!(
            normalize_script_content("alpha\r\nbeta\r\n".to_string()),
            "alpha\nbeta\n"
        );
        assert_eq!(
            normalize_package_include_patterns(Some(vec![
                " pics/{code}.jpg ".to_string(),
                "".to_string(),
                "script\\*.lua".to_string(),
            ])),
            vec!["pics/{code}.jpg".to_string(), "script/*.lua".to_string()]
        );
        assert_eq!(
            normalize_package_include_patterns(Some(Vec::new())),
            DEFAULT_PACKAGE_INCLUDE_PATTERNS
                .iter()
                .map(|item| item.to_string())
                .collect::<Vec<_>>()
        );
        assert_eq!(
            normalize_package_include_patterns(Some(vec![
                "pics/{code}.jpg".to_string(),
                "pics/field/{code}.jpg".to_string(),
                "script/{code}.lua".to_string(),
                "strings.conf".to_string(),
                "lflist.conf".to_string(),
            ])),
            DEFAULT_PACKAGE_INCLUDE_PATTERNS
                .iter()
                .map(|item| item.to_string())
                .collect::<Vec<_>>()
        );
    }
}
