use std::{
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

mod commands;
mod models;
mod repository;
mod services;
mod session;
#[cfg(test)]
mod test_helpers;
pub(crate) use models::app::*;
pub(crate) use services::app_config::*;
pub(crate) use services::crypto::*;
use session::cdb::OpenCdbSessions;

const SETTINGS_FILE_NAME: &str = "settings.json";
const CIPHER_KEY_FILE_NAME: &str = "cipher.key";
const CUSTOM_COVER_FILE_NAME: &str = "cover.jpg";
const LOGS_DIR_NAME: &str = "logs";
const ERROR_LOG_FILE_NAME: &str = "error.log";
const DEFAULT_SCRIPT_TEMPLATE: &str =
    "-- {鍗″悕}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n";
const DEFAULT_AI_MODEL: &str = "gpt-4o-mini";
const DEFAULT_AI_TEMPERATURE: f64 = 1.0;
const SECRET_VERSION_PREFIX: &str = "v1";
const APP_IDENTIFIER: &str = "com.kkr223.dataeditory";
const OPEN_CDB_PATHS_EVENT: &str = "open-cdb-paths";
pub(crate) const BACKGROUND_TASK_PROGRESS_EVENT: &str = "background-task-progress";

pub(crate) struct PendingOpenCdbPaths(Mutex<Vec<String>>);

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
            commands::cdb::get_cards_by_ids,
            commands::cdb::modify_cards,
            commands::cdb::delete_cards,
            commands::cdb::create_cdb_from_cards,
            commands::cdb::copy_card_assets,
            commands::cdb::analyze_cdb_merge,
            commands::cdb::collect_merge_sources_from_folder,
            commands::cdb::execute_cdb_merge,
            commands::cdb::undo_modify_operation,
            commands::media::read_cdb,
            commands::media::read_text_file,
            commands::media::write_cdb,
            commands::media::write_file,
            commands::media::path_exists,
            commands::media::list_image_folder_entries,
            commands::media::copy_image,
            commands::media::read_image,
            commands::media::import_card_image,
            commands::media::load_strings_conf,
            commands::media::open_in_system_editor,
            commands::media::open_in_default_app,
            commands::settings::load_app_settings,
            commands::settings::save_app_settings,
            commands::settings::load_secret_key,
            commands::settings::set_cover_image,
            commands::settings::clear_cover_image,
            commands::scripts::get_card_script_info,
            commands::scripts::read_card_script,
            commands::scripts::write_card_script,
            commands::scripts::save_card_script,
            commands::package::package_cdb_assets_as_zip,
            commands::app::append_error_log,
            commands::app::consume_pending_open_cdb_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

