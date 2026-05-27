use std::sync::Mutex;
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
    "-- {name}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n";
const DEFAULT_AI_MODEL: &str = "gpt-4o-mini";
const DEFAULT_AI_TEMPERATURE: f64 = 1.0;
const DEFAULT_PACKAGE_INCLUDE_PATTERNS: &[&str] = &[
    "pics/{code}.jpg",
    "pics/field/{code}.jpg",
    "script/c{code}.lua",
    "strings.conf",
    "lflist.conf",
];
const SECRET_VERSION_PREFIX: &str = "v1";
#[cfg(feature = "ai")]
const APP_IDENTIFIER: &str = "com.kkr223.dataeditory";
const OPEN_CDB_PATHS_EVENT: &str = "open-cdb-paths";
const OPEN_EXTERNAL_PATHS_EVENT: &str = "open-external-paths";
pub(crate) const BACKGROUND_TASK_PROGRESS_EVENT: &str = "background-task-progress";

pub(crate) struct PendingExternalOpenPaths(Mutex<ExternalOpenPaths>);

fn collect_external_open_paths_from_args<I>(args: I) -> ExternalOpenPaths
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    services::media::collect_external_open_paths_from_args(args)
}

fn push_unique_paths(target: &mut Vec<String>, paths: &[String]) {
    for path in paths {
        if !target.contains(path) {
            target.push(path.clone());
        }
    }
}

fn queue_external_open_paths(app: &AppHandle, paths: ExternalOpenPaths) {
    if paths.cdb_paths.is_empty() && paths.text_paths.is_empty() {
        return;
    }

    let pending_state = app.state::<PendingExternalOpenPaths>();
    let mut pending = pending_state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    push_unique_paths(&mut pending.cdb_paths, &paths.cdb_paths);
    push_unique_paths(&mut pending.text_paths, &paths.text_paths);

    let _ = app.emit(OPEN_EXTERNAL_PATHS_EVENT, &paths);
    if !paths.cdb_paths.is_empty() {
        let _ = app.emit(OPEN_CDB_PATHS_EVENT, &paths.cdb_paths);
    }

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .register_uri_scheme_protocol(services::media::media_protocol_name(), |_ctx, request| {
            services::media::handle_media_protocol_request(request)
        })
        .manage(PendingExternalOpenPaths(Mutex::new(ExternalOpenPaths::default())))
        .manage(OpenCdbSessions(
            Mutex::new(std::collections::HashMap::new()),
        ));

    #[cfg(feature = "card-render")]
    let builder = builder.manage(services::card_render::RenderResourceRegistry::default());

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let paths = collect_external_open_paths_from_args(argv.into_iter().skip(1));
            queue_external_open_paths(app, paths);
        }))
        .setup(|app| {
            let paths = collect_external_open_paths_from_args(std::env::args_os().skip(1));
            queue_external_open_paths(&app.handle(), paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::list_ai_models,
            commands::ai::request_ai_chat_completion,
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
            commands::media::pick_card_image_config,
            commands::media::pick_deck_text,
            commands::media::read_external_text_file,
            commands::media::save_card_image_config,
            commands::media::save_external_text_file,
            commands::media::save_png_file,
            commands::media::save_card_image_jpg,
            commands::media::save_script_image,
            commands::media::path_exists,
            commands::media::list_image_folder_entries,
            commands::media::import_card_image,
            commands::media::load_strings_conf,
            commands::media::load_lua_intel_resource,
            commands::media::open_in_system_editor,
            commands::media::open_in_default_app,
            commands::settings::load_app_settings,
            commands::settings::save_app_settings,
            commands::settings::set_cover_image,
            commands::settings::clear_cover_image,
            commands::scripts::get_card_script_info,
            commands::scripts::read_card_script,
            commands::scripts::write_card_script,
            commands::scripts::save_card_script,
            commands::package::package_cdb_assets_as_zip,
            commands::render_card::render_card,
            commands::render_card::prepare_card_render_resource,
            commands::render_card::release_card_render_resource,
            commands::app::append_error_log,
            commands::app::consume_pending_external_open_paths,
            commands::app::consume_pending_open_cdb_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
