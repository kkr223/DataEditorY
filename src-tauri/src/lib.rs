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
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

mod cdb;
use cdb::OpenCdbSessions;

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
struct PersistedAppSettings {
    api_base_url: String,
    model: String,
    temperature: f64,
    script_template: String,
    encrypted_secret_key: Option<String>,
}

impl Default for PersistedAppSettings {
    fn default() -> Self {
        Self {
            api_base_url: String::new(),
            model: DEFAULT_AI_MODEL.to_string(),
            temperature: DEFAULT_AI_TEMPERATURE,
            script_template: DEFAULT_SCRIPT_TEMPLATE.to_string(),
            encrypted_secret_key: None,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppSettingsPayload {
    api_base_url: String,
    model: String,
    temperature: f64,
    script_template: String,
    has_secret_key: bool,
    cover_image_path: Option<String>,
    error_log_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveAppSettingsRequest {
    api_base_url: String,
    model: Option<String>,
    temperature: Option<f64>,
    script_template: String,
    secret_key: Option<String>,
    clear_secret_key: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CardScriptInfo {
    path: String,
    exists: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppendErrorLogRequest {
    source: String,
    message: String,
    stack: Option<String>,
    extra: Option<String>,
}

struct PendingOpenCdbPaths(Mutex<Vec<String>>);

fn ensure_app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn custom_cover_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(CUSTOM_COVER_FILE_NAME))
}

fn logs_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(ensure_app_config_dir(app)?.join(LOGS_DIR_NAME))
}

fn error_log_path(app: &AppHandle) -> Result<PathBuf, String> {
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

fn load_persisted_settings(app: &AppHandle) -> Result<PersistedAppSettings, String> {
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

fn save_persisted_settings(app: &AppHandle, settings: &PersistedAppSettings) -> Result<(), String> {
    let path = settings_file_path(app)?;
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

fn normalize_base_url(value: String) -> String {
    value.trim().trim_end_matches('/').to_string()
}

fn normalize_model(value: Option<String>) -> String {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .unwrap_or_else(|| DEFAULT_AI_MODEL.to_string())
}

fn normalize_script_template(value: String) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        DEFAULT_SCRIPT_TEMPLATE.to_string()
    } else {
        value.replace("\r\n", "\n")
    }
}

fn normalize_temperature(value: Option<f64>) -> f64 {
    match value {
        Some(item) if item.is_finite() => item.clamp(0.0, 2.0),
        _ => DEFAULT_AI_TEMPERATURE,
    }
}

/// Returns a persistent random cipher key, creating one on first use.
/// This replaces the old environment-variable-based derivation so that
/// the key remains stable even if USERNAME, COMPUTERNAME, etc. change.
fn get_or_create_cipher_key(app: &AppHandle) -> Result<[u8; 32], String> {
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

    for key in ["COMPUTERNAME", "HOSTNAME", "USERNAME", "USER", "APPDATA", "HOME"] {
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

fn encrypt_secret_key(app: &AppHandle, secret_key: &str) -> Result<String, String> {
    let key = get_or_create_cipher_key(app)?;
    encrypt_with_key(&key, secret_key)
}

/// Tries the stable cipher key first; falls back to the legacy
/// environment-variable-based key for transparent migration.
fn decrypt_secret_key(app: &AppHandle, encrypted_secret_key: &str) -> Result<String, String> {
    let stable_key = get_or_create_cipher_key(app)?;
    if let Ok(plaintext) = decrypt_with_key(&stable_key, encrypted_secret_key) {
        return Ok(plaintext);
    }

    // Legacy fallback — the secret was encrypted before the migration.
    decrypt_with_key(&legacy_cipher_key(app), encrypted_secret_key)
}

fn to_settings_payload(
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
        has_secret_key: settings.encrypted_secret_key.is_some(),
        cover_image_path: if cover_path.exists() {
            Some(cover_path.to_string_lossy().to_string())
        } else {
            None
        },
        error_log_path: error_log_path(app)?.to_string_lossy().to_string(),
    })
}

fn now_local_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}.{}", now.as_secs(), now.subsec_millis())
}

fn build_card_script_path(cdb_path: &str, card_id: u32) -> Result<PathBuf, String> {
    let cdb_path = Path::new(cdb_path);
    let cdb_dir = cdb_path
        .parent()
        .ok_or_else(|| "Unable to resolve the database directory".to_string())?;
    Ok(cdb_dir.join("script").join(format!("c{card_id}.lua")))
}

fn vscode_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("code")];

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            Path::new(&local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        candidates.push(
            Path::new(&program_files)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            Path::new(&program_files_x86)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    candidates
}

fn open_with_preferred_editor(path: &Path) -> Result<(), String> {
    for candidate in vscode_candidates() {
        let mut command = Command::new(&candidate);
        if command.arg("-g").arg(path).spawn().is_ok() {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

fn normalize_cdb_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    if !extension.eq_ignore_ascii_case("cdb") || !path.is_file() {
        return None;
    }

    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Some(resolved.to_string_lossy().to_string())
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::new();
    for path in paths {
        if !deduped.contains(&path) {
            deduped.push(path);
        }
    }
    deduped
}

fn collect_cdb_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    dedupe_paths(
        args.into_iter()
            .filter_map(|arg| {
                let value: std::ffi::OsString = arg.into();
                normalize_cdb_path(Path::new(&value))
            })
            .collect(),
    )
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
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_cdb(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

/// Generic file-write command — identical to write_cdb but with a clearer
/// name for non-database file writes (images, scripts, exports, etc.).
#[tauri::command]
fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_image(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dest).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_strings_conf(app: AppHandle) -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("strings.conf"));
        candidates.push(resource_dir.join("strings.conf"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("strings.conf"));
        candidates.push(current_dir.join("static").join("strings.conf"));
        candidates.push(current_dir.join("static").join("resources").join("strings.conf"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("strings.conf"));
            candidates.push(exe_dir.join("resources").join("strings.conf"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("strings.conf"));
                candidates.push(parent.join("resources").join("strings.conf"));
            }
        }
    }

    for path in candidates {
        if path.exists() {
            return fs::read_to_string(&path).map_err(|e| e.to_string());
        }
    }

    Err("strings.conf not found in external locations".to_string())
}

#[tauri::command]
fn load_app_settings(app: AppHandle) -> Result<AppSettingsPayload, String> {
    let settings = load_persisted_settings(&app)?;
    to_settings_payload(&app, settings)
}

#[tauri::command]
fn save_app_settings(app: AppHandle, request: SaveAppSettingsRequest) -> Result<AppSettingsPayload, String> {
    let mut settings = load_persisted_settings(&app)?;
    settings.api_base_url = normalize_base_url(request.api_base_url);
    settings.model = normalize_model(request.model);
    settings.temperature = normalize_temperature(request.temperature.or(Some(settings.temperature)));
    settings.script_template = normalize_script_template(request.script_template);

    if request.clear_secret_key.unwrap_or(false) {
        settings.encrypted_secret_key = None;
    }

    if let Some(secret_key) = request.secret_key {
        let secret_key = secret_key.trim();
        if !secret_key.is_empty() {
            settings.encrypted_secret_key = Some(encrypt_secret_key(&app, secret_key)?);
        }
    }

    save_persisted_settings(&app, &settings)?;
    to_settings_payload(&app, settings)
}

#[tauri::command]
fn load_secret_key(app: AppHandle) -> Result<Option<String>, String> {
    let settings = load_persisted_settings(&app)?;
    match settings.encrypted_secret_key {
        Some(secret_key) => decrypt_secret_key(&app, &secret_key).map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
fn set_cover_image(app: AppHandle, source_path: String) -> Result<String, String> {
    let cover_path = custom_cover_path(&app)?;
    if let Some(parent) = cover_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::copy(&source_path, &cover_path).map_err(|err| err.to_string())?;
    Ok(cover_path.to_string_lossy().to_string())
}

#[tauri::command]
fn clear_cover_image(app: AppHandle) -> Result<(), String> {
    let cover_path = custom_cover_path(&app)?;
    if cover_path.exists() {
        fs::remove_file(cover_path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_card_script_info(cdb_path: String, card_id: u32) -> Result<CardScriptInfo, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    Ok(CardScriptInfo {
        path: script_path.to_string_lossy().to_string(),
        exists: script_path.exists(),
    })
}

#[tauri::command]
fn write_card_script(
    cdb_path: String,
    card_id: u32,
    content: String,
    overwrite: bool,
) -> Result<CardScriptInfo, String> {
    let script_path = build_card_script_path(&cdb_path, card_id)?;
    if script_path.exists() && !overwrite {
        return Err("Script already exists".to_string());
    }

    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    fs::write(&script_path, content).map_err(|err| err.to_string())?;
    Ok(CardScriptInfo {
        path: script_path.to_string_lossy().to_string(),
        exists: true,
    })
}

#[tauri::command]
fn open_in_system_editor(path: String) -> Result<(), String> {
    open_with_preferred_editor(Path::new(&path))
}

#[tauri::command]
fn append_error_log(app: AppHandle, request: AppendErrorLogRequest) -> Result<String, String> {
    let path = error_log_path(&app)?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|err| err.to_string())?;

    writeln!(file, "[{}] {}", now_local_timestamp(), request.source).map_err(|err| err.to_string())?;
    writeln!(file, "message: {}", request.message).map_err(|err| err.to_string())?;

    if let Some(stack) = request.stack.filter(|value| !value.trim().is_empty()) {
        writeln!(file, "stack:\n{}", stack).map_err(|err| err.to_string())?;
    }

    if let Some(extra) = request.extra.filter(|value| !value.trim().is_empty()) {
        writeln!(file, "extra: {}", extra).map_err(|err| err.to_string())?;
    }

    writeln!(file).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
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
        .manage(PendingOpenCdbPaths(Mutex::new(Vec::new())))
        .manage(OpenCdbSessions(Mutex::new(std::collections::HashMap::new())))
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
            cdb::open_cdb_tab,
            cdb::create_cdb_tab,
            cdb::close_cdb_tab,
            cdb::save_cdb_tab,
            cdb::search_cards_page,
            cdb::query_cards_raw,
            cdb::get_card_by_id,
            cdb::modify_cards,
            cdb::delete_cards,
            read_cdb,
            read_text_file,
            write_cdb,
            write_file,
            copy_image,
            read_image,
            load_strings_conf,
            load_app_settings,
            save_app_settings,
            load_secret_key,
            set_cover_image,
            clear_cover_image,
            get_card_script_info,
            write_card_script,
            open_in_system_editor,
            append_error_log,
            consume_pending_open_cdb_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
