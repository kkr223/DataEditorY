use std::{fs, path::Path};
use tauri::AppHandle;

use crate::{
    custom_cover_path, decrypt_secret_key, encrypt_secret_key, load_persisted_settings,
    normalize_base_url, normalize_model, normalize_script_template, normalize_temperature,
    save_persisted_settings, to_settings_payload, AppSettingsPayload, SaveAppSettingsRequest,
};

pub fn load_app_settings(app: &AppHandle) -> Result<AppSettingsPayload, String> {
    let settings = load_persisted_settings(app)?;
    to_settings_payload(app, settings)
}

pub fn save_app_settings(
    app: &AppHandle,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsPayload, String> {
    let mut settings = load_persisted_settings(app)?;
    settings.api_base_url = normalize_base_url(request.api_base_url);
    settings.model = normalize_model(request.model);
    settings.temperature =
        normalize_temperature(request.temperature.or(Some(settings.temperature)));
    settings.script_template = normalize_script_template(request.script_template);
    settings.use_external_script_editor = request
        .use_external_script_editor
        .unwrap_or(settings.use_external_script_editor);
    settings.save_script_image_to_local = request
        .save_script_image_to_local
        .unwrap_or(settings.save_script_image_to_local);

    if request.clear_secret_key.unwrap_or(false) {
        settings.encrypted_secret_key = None;
    }

    if let Some(secret_key) = request.secret_key {
        let secret_key = secret_key.trim();
        if !secret_key.is_empty() {
            settings.encrypted_secret_key = Some(encrypt_secret_key(app, secret_key)?);
        }
    }

    save_persisted_settings(app, &settings)?;
    to_settings_payload(app, settings)
}

pub fn load_secret_key(app: &AppHandle) -> Result<Option<String>, String> {
    let settings = load_persisted_settings(app)?;
    match settings.encrypted_secret_key {
        Some(secret_key) => decrypt_secret_key(app, &secret_key).map(Some),
        None => Ok(None),
    }
}

pub fn set_cover_image(app: &AppHandle, source_path: String) -> Result<String, String> {
    let cover_path = custom_cover_path(app)?;
    if let Some(parent) = cover_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::copy(Path::new(&source_path), &cover_path).map_err(|err| err.to_string())?;
    Ok(cover_path.to_string_lossy().to_string())
}

pub fn clear_cover_image(app: &AppHandle) -> Result<(), String> {
    let cover_path = custom_cover_path(app)?;
    if cover_path.exists() {
        fs::remove_file(cover_path).map_err(|err| err.to_string())?;
    }
    Ok(())
}
