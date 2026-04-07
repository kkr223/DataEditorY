use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

mod commands;
mod models;
mod repository;
mod services;
mod session;
use session::cdb::OpenCdbSessions;

const SETTINGS_FILE_NAME: &str = "settings.json";
const CIPHER_KEY_FILE_NAME: &str = "cipher.key";
const CUSTOM_COVER_FILE_NAME: &str = "cover.jpg";
const LOGS_DIR_NAME: &str = "logs";
const ERROR_LOG_FILE_NAME: &str = "error.log";
const DEFAULT_SCRIPT_TEMPLATE: &str =
    "-- {卡名}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n";
const DEFAULT_AI_MODEL: &str = "gpt-4o-mini";
const DEFAULT_AI_TEMPERATURE: f64 = 1.0;
const SECRET_VERSION_PREFIX: &str = "v1";
const APP_IDENTIFIER: &str = "com.kkr223.dataeditory";
const OPEN_CDB_PATHS_EVENT: &str = "open-cdb-paths";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct PersistedAppSettings {
    pub(crate) api_base_url: String,
    pub(crate) model: String,
    pub(crate) temperature: f64,
    pub(crate) script_template: String,
    pub(crate) use_external_script_editor: bool,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppendErrorLogRequest {
    pub(crate) source: String,
    pub(crate) message: String,
    pub(crate) stack: Option<String>,
    pub(crate) extra: Option<String>,
}

struct PendingOpenCdbPaths(Mutex<Vec<String>>);

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
    if settings.script_template.trim().is_empty() {
        settings.script_template = DEFAULT_SCRIPT_TEMPLATE.to_string();
    }
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
    if trimmed.is_empty() {
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

/// Returns a persistent random cipher key, creating one on first use.
/// This replaces the old environment-variable-based derivation so that
/// the key remains stable even if USERNAME, COMPUTERNAME, etc. change.
pub(crate) fn get_or_create_cipher_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let key_path = ensure_app_config_dir(app)?.join(CIPHER_KEY_FILE_NAME);

    if key_path.exists() {
        let bytes = fs::read(&key_path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        // File is corrupt / wrong size — regenerate below.
    }

    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    fs::write(&key_path, key).map_err(|e| e.to_string())?;
    Ok(key)
}

/// Legacy key derivation (pre-stable-key migration).  Kept only so that
/// secrets encrypted before the migration can still be decrypted once.
fn legacy_cipher_key(app: &AppHandle) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update("DataEditorY::secret-key");
    hasher.update(APP_IDENTIFIER.as_bytes());
    hasher.update(app.package_info().name.as_bytes());

    for key in [
        "COMPUTERNAME",
        "HOSTNAME",
        "USERNAME",
        "USER",
        "APPDATA",
        "HOME",
    ] {
        if let Ok(value) = std::env::var(key) {
            hasher.update(value.as_bytes());
        }
    }

    let digest = hasher.finalize();
    let mut output = [0u8; 32];
    output.copy_from_slice(&digest[..32]);
    output
}

fn encrypt_with_key(key: &[u8; 32], secret_key: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|err| err.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, secret_key.as_bytes())
        .map_err(|err| err.to_string())?;

    Ok(format!(
        "{SECRET_VERSION_PREFIX}:{}:{}",
        BASE64_STANDARD.encode(nonce_bytes),
        BASE64_STANDARD.encode(ciphertext)
    ))
}

fn decrypt_with_key(key: &[u8; 32], encrypted_secret_key: &str) -> Result<String, String> {
    let parts: Vec<&str> = encrypted_secret_key.splitn(3, ':').collect();
    if parts.len() != 3 || parts[0] != SECRET_VERSION_PREFIX {
        return Err("Unsupported secret key format".to_string());
    }

    let nonce_bytes = BASE64_STANDARD
        .decode(parts[1])
        .map_err(|err| err.to_string())?;
    let ciphertext = BASE64_STANDARD
        .decode(parts[2])
        .map_err(|err| err.to_string())?;

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|err| err.to_string())?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|err| err.to_string())?;

    String::from_utf8(plaintext).map_err(|err| err.to_string())
}

pub(crate) fn encrypt_secret_key(app: &AppHandle, secret_key: &str) -> Result<String, String> {
    let key = get_or_create_cipher_key(app)?;
    encrypt_with_key(&key, secret_key)
}

/// Tries the stable cipher key first; falls back to the legacy
/// environment-variable-based key for transparent migration.
pub(crate) fn decrypt_secret_key(
    app: &AppHandle,
    encrypted_secret_key: &str,
) -> Result<String, String> {
    let stable_key = get_or_create_cipher_key(app)?;
    if let Ok(plaintext) = decrypt_with_key(&stable_key, encrypted_secret_key) {
        return Ok(plaintext);
    }

    // Legacy fallback — the secret was encrypted before the migration.
    decrypt_with_key(&legacy_cipher_key(app), encrypted_secret_key)
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
        script_template: if settings.script_template.trim().is_empty() {
            DEFAULT_SCRIPT_TEMPLATE.to_string()
        } else {
            settings.script_template
        },
        use_external_script_editor: settings.use_external_script_editor,
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

fn collect_cdb_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    services::media::collect_cdb_paths_from_args(args)
}

fn queue_open_cdb_paths(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }

    if let Ok(mut pending) = app.state::<PendingOpenCdbPaths>().0.lock() {
        for path in &paths {
            if !pending.contains(path) {
                pending.push(path.clone());
            }
        }
    }

    let _ = app.emit(OPEN_CDB_PATHS_EVENT, &paths);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn read_cdb(path: String) -> Result<Vec<u8>, String> {
    services::media::read_cdb(path)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    services::media::read_text_file(path)
}

#[tauri::command]
fn write_cdb(path: String, data: Vec<u8>) -> Result<(), String> {
    services::media::write_cdb(path, data)
}

/// Generic file-write command — identical to write_cdb but with a clearer
/// name for non-database file writes (images, scripts, exports, etc.).
#[tauri::command]
fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    services::media::write_file(path, data)
}

#[tauri::command]
fn path_exists(path: String) -> Result<bool, String> {
    services::media::path_exists(path)
}

#[tauri::command]
fn copy_image(src: String, dest: String) -> Result<(), String> {
    services::media::copy_image(src, dest)
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    services::media::read_image(path)
}

#[tauri::command]
fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<(), String> {
    services::media::import_card_image(src, dest, max_width, max_height, quality)
}

#[tauri::command]
fn load_strings_conf(app: AppHandle) -> Result<String, String> {
    services::media::load_strings_conf(&app)
}

#[tauri::command]
fn load_app_settings(app: AppHandle) -> Result<AppSettingsPayload, String> {
    services::settings::load_app_settings(&app)
}

#[tauri::command]
fn save_app_settings(
    app: AppHandle,
    request: SaveAppSettingsRequest,
) -> Result<AppSettingsPayload, String> {
    services::settings::save_app_settings(&app, request)
}

#[tauri::command]
fn load_secret_key(app: AppHandle) -> Result<Option<String>, String> {
    services::settings::load_secret_key(&app)
}

#[tauri::command]
fn set_cover_image(app: AppHandle, source_path: String) -> Result<String, String> {
    services::settings::set_cover_image(&app, source_path)
}

#[tauri::command]
fn clear_cover_image(app: AppHandle) -> Result<(), String> {
    services::settings::clear_cover_image(&app)
}

#[tauri::command]
fn get_card_script_info(cdb_path: String, card_id: u32) -> Result<CardScriptInfo, String> {
    services::scripts::get_card_script_info(cdb_path, card_id)
}

#[tauri::command]
fn read_card_script(cdb_path: String, card_id: u32) -> Result<CardScriptDocument, String> {
    services::scripts::read_card_script(cdb_path, card_id)
}

#[tauri::command]
fn write_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
    overwrite: bool,
) -> Result<CardScriptInfo, String> {
    services::scripts::write_card_script(cdb_path, card_id, content, overwrite)
}

#[tauri::command]
fn save_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
) -> Result<CardScriptInfo, String> {
    services::scripts::save_card_script(cdb_path, card_id, content)
}

#[tauri::command]
fn package_cdb_assets_as_zip(
    cdb_path: String,
    output_path: String,
) -> Result<ZipPackageInfo, String> {
    services::package::package_cdb_assets_as_zip(cdb_path, output_path)
}

#[tauri::command]
fn open_in_system_editor(path: String) -> Result<(), String> {
    services::media::open_in_system_editor(path)
}

#[tauri::command]
fn open_in_default_app(path: String) -> Result<(), String> {
    services::media::open_in_default_app(path)
}

#[tauri::command]
fn append_error_log(app: AppHandle, request: AppendErrorLogRequest) -> Result<String, String> {
    services::logging::append_error_log(&app, request)
}

#[tauri::command]
fn consume_pending_open_cdb_paths(
    state: tauri::State<'_, PendingOpenCdbPaths>,
) -> Result<Vec<String>, String> {
    let mut pending = state
        .0
        .lock()
        .map_err(|_| "Failed to acquire pending cdb paths".to_string())?;
    Ok(std::mem::take(&mut *pending))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol(services::media::media_protocol_name(), |_ctx, request| {
            services::media::handle_media_protocol_request(request)
        })
        .manage(PendingOpenCdbPaths(Mutex::new(Vec::new())))
        .manage(OpenCdbSessions(
            Mutex::new(std::collections::HashMap::new()),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = collect_cdb_paths_from_args(argv.into_iter().skip(1));
            queue_open_cdb_paths(app, paths);
        }))
        .setup(|app| {
            let paths = collect_cdb_paths_from_args(std::env::args_os().skip(1));
            queue_open_cdb_paths(&app.handle(), paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::cdb::open_cdb_tab,
            commands::cdb::create_cdb_tab,
            commands::cdb::close_cdb_tab,
            commands::cdb::save_cdb_tab,
            commands::cdb::search_cards_page,
            commands::cdb::query_cards_raw,
            commands::cdb::get_card_by_id,
            commands::cdb::modify_cards,
            commands::cdb::delete_cards,
            commands::cdb::create_cdb_from_cards,
            commands::cdb::copy_card_assets,
            commands::cdb::analyze_cdb_merge,
            commands::cdb::collect_merge_sources_from_folder,
            commands::cdb::execute_cdb_merge,
            read_cdb,
            read_text_file,
            write_cdb,
            write_file,
            path_exists,
            copy_image,
            read_image,
            import_card_image,
            load_strings_conf,
            load_app_settings,
            save_app_settings,
            load_secret_key,
            set_cover_image,
            clear_cover_image,
            get_card_script_info,
            read_card_script,
            write_card_script,
            save_card_script,
            package_cdb_assets_as_zip,
            open_in_system_editor,
            open_in_default_app,
            append_error_log,
            consume_pending_open_cdb_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    fn make_temp_dir(label: &str) -> PathBuf {
        let unique = format!(
            "dataeditory-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn create_test_cdb(path: &Path, rows: &[(u32, i64)]) {
        let conn = rusqlite::Connection::open(path).unwrap();
        conn.execute(
            "CREATE TABLE datas (id INTEGER PRIMARY KEY, type INTEGER NOT NULL)",
            [],
        )
        .unwrap();

        let mut stmt = conn
            .prepare("INSERT INTO datas (id, type) VALUES (?1, ?2)")
            .unwrap();
        for (id, card_type) in rows {
            stmt.execute(rusqlite::params![i64::from(*id), *card_type])
                .unwrap();
        }
    }

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
            normalize_script_content("alpha\r\nbeta\r\n".to_string()),
            "alpha\nbeta\n"
        );
    }

    #[test]
    fn builds_zip_entries_with_forward_slashes() {
        let base_dir = Path::new("workspace");
        let nested_path = Path::new("workspace").join("script").join("c100.lua");

        let entry = services::package::path_to_zip_entry(&nested_path, base_dir).unwrap();

        assert_eq!(entry, "script/c100.lua");
    }

    #[test]
    fn resolves_script_dependencies_inside_workspace_only() {
        let cdb_dir = make_temp_dir("script-deps");
        let script_dir = cdb_dir.join("script");
        fs::create_dir_all(script_dir.join("shared")).unwrap();

        let local_script = script_dir.join("utility.lua");
        let nested_script = script_dir.join("shared").join("common.lua");
        fs::write(&local_script, "-- local").unwrap();
        fs::write(&nested_script, "-- nested").unwrap();

        let escaped_path = cdb_dir.parent().unwrap().join("dataeditory-outside.lua");
        fs::write(&escaped_path, "-- outside").unwrap();

        let resolved_local =
            services::package::resolve_script_dependency_path(&cdb_dir, &script_dir, "utility.lua")
                .unwrap();
        let resolved_prefixed = services::package::resolve_script_dependency_path(
            &cdb_dir,
            &script_dir,
            "script/shared/common.lua",
        )
        .unwrap();
        let escaped = services::package::resolve_script_dependency_path(
            &cdb_dir,
            &script_dir,
            "../../dataeditory-outside.lua",
        );

        assert_eq!(resolved_local.file_name().unwrap(), "utility.lua");
        assert_eq!(resolved_prefixed.file_name().unwrap(), "common.lua");
        assert!(escaped.is_none());

        let _ = fs::remove_file(&escaped_path);
        let _ = fs::remove_dir_all(&cdb_dir);
    }

    #[test]
    fn collects_existing_cdb_paths_from_args() {
        let root = make_temp_dir("collect-cdb");
        let first = root.join("cards-a.cdb");
        let second = root.join("cards-b.CDB");
        let ignored = root.join("notes.txt");
        fs::write(&first, []).unwrap();
        fs::write(&second, []).unwrap();
        fs::write(&ignored, []).unwrap();

        let collected = services::media::collect_cdb_paths_from_args(vec![
            first.as_os_str().to_os_string(),
            second.as_os_str().to_os_string(),
            ignored.as_os_str().to_os_string(),
            first.as_os_str().to_os_string(),
        ]);

        assert_eq!(collected.len(), 2);
        assert!(collected.iter().any(|path| path.ends_with("cards-a.cdb")));
        assert!(collected
            .iter()
            .any(|path| path.to_ascii_lowercase().ends_with("cards-b.cdb")));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn packages_only_current_cdb_card_assets() {
        let root = make_temp_dir("package-assets");
        let cdb_path = root.join("cards.cdb");
        let pics_dir = root.join("pics");
        let field_pics_dir = pics_dir.join("field");
        let script_dir = root.join("script");
        let output_zip_path = root.join("cards.zip");

        fs::create_dir_all(&field_pics_dir).unwrap();
        fs::create_dir_all(&script_dir).unwrap();

        create_test_cdb(&cdb_path, &[(111, 0x2 | 0x80000), (222, 0x1)]);

        fs::write(pics_dir.join("111.jpg"), [1u8]).unwrap();
        fs::write(pics_dir.join("222.jpg"), [2u8]).unwrap();
        fs::write(pics_dir.join("333.jpg"), [3u8]).unwrap();
        fs::write(field_pics_dir.join("111.jpg"), [4u8]).unwrap();
        fs::write(field_pics_dir.join("222.jpg"), [5u8]).unwrap();
        fs::write(
            script_dir.join("c111.lua"),
            "Duel.LoadScript(\"utility.lua\")",
        )
        .unwrap();
        fs::write(script_dir.join("c222.lua"), "-- direct").unwrap();
        fs::write(script_dir.join("c333.lua"), "-- unrelated").unwrap();
        fs::write(script_dir.join("utility.lua"), "-- shared").unwrap();
        fs::write(root.join("strings.conf"), "# strings").unwrap();
        fs::write(root.join("custom.CONF"), "# custom").unwrap();
        fs::write(root.join("notes.txt"), "ignore").unwrap();

        services::package::package_cdb_assets_as_zip(
            cdb_path.to_string_lossy().to_string(),
            output_zip_path.to_string_lossy().to_string(),
        )
        .unwrap();

        let zip_file = fs::File::open(&output_zip_path).unwrap();
        let mut archive = ZipArchive::new(zip_file).unwrap();
        let mut entries = Vec::new();
        for index in 0..archive.len() {
            entries.push(archive.by_index(index).unwrap().name().to_string());
        }
        entries.sort();

        assert!(entries.contains(&"cards.cdb".to_string()));
        assert!(entries.contains(&"pics/111.jpg".to_string()));
        assert!(entries.contains(&"pics/222.jpg".to_string()));
        assert!(entries.contains(&"pics/field/111.jpg".to_string()));
        assert!(entries.contains(&"script/c111.lua".to_string()));
        assert!(entries.contains(&"script/c222.lua".to_string()));
        assert!(entries.contains(&"script/utility.lua".to_string()));
        assert!(entries.contains(&"strings.conf".to_string()));
        assert!(entries.contains(&"custom.CONF".to_string()));
        assert!(!entries.contains(&"pics/333.jpg".to_string()));
        assert!(!entries.contains(&"pics/field/222.jpg".to_string()));
        assert!(!entries.contains(&"script/c333.lua".to_string()));
        assert!(!entries.contains(&"notes.txt".to_string()));

        let _ = fs::remove_dir_all(&root);
    }
}
