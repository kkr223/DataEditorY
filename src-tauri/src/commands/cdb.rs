use tauri::{AppHandle, State};

use crate::{
    models::cdb::{
        AnalyzeCdbMergeRequest, AnalyzeCdbMergeResponse, CardDto,
        CollectMergeSourcesFromFolderRequest, CopyCardAssetsRequest, CreateCdbFromCardsRequest,
        DeleteCardsRequest, ExecuteCdbMergeRequest, ExecuteCdbMergeResponse, MergeSourceItemDto,
        ModifyCardsRequest, OpenCdbTabResponse, QueryCardsRequest, SearchCardsPageRequest,
        SearchCardsPageResponse,
    },
    services::{
        assets as cdb_assets_service, cdb_cards as cdb_cards_service,
        cdb_session as cdb_session_service, merge as cdb_merge_service,
    },
    session::cdb::OpenCdbSessions,
};

#[tauri::command]
pub fn open_cdb_tab(
    app: AppHandle,
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    cdb_session_service::open_cdb_tab(&app, state.inner(), tab_id, path)
}

#[tauri::command]
pub fn create_cdb_tab(
    app: AppHandle,
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    path: String,
) -> Result<OpenCdbTabResponse, String> {
    cdb_session_service::create_cdb_tab(&app, state.inner(), tab_id, path)
}

#[tauri::command]
pub fn close_cdb_tab(state: State<'_, OpenCdbSessions>, tab_id: String) -> Result<(), String> {
    cdb_session_service::close_cdb_tab(state.inner(), tab_id)
}

#[tauri::command]
pub fn save_cdb_tab(state: State<'_, OpenCdbSessions>, tab_id: String) -> Result<(), String> {
    cdb_session_service::save_cdb_tab(state.inner(), tab_id)
}

#[tauri::command]
pub fn search_cards_page(
    state: State<'_, OpenCdbSessions>,
    request: SearchCardsPageRequest,
) -> Result<SearchCardsPageResponse, String> {
    cdb_cards_service::search_cards_page(state.inner(), request)
}

#[tauri::command]
pub fn query_cards_raw(
    state: State<'_, OpenCdbSessions>,
    request: QueryCardsRequest,
) -> Result<Vec<CardDto>, String> {
    cdb_cards_service::query_cards_raw(state.inner(), request)
}

#[tauri::command]
pub fn get_card_by_id(
    state: State<'_, OpenCdbSessions>,
    tab_id: String,
    card_id: u32,
) -> Result<Option<CardDto>, String> {
    cdb_cards_service::get_card_by_id(state.inner(), tab_id, card_id)
}

#[tauri::command]
pub fn modify_cards(
    state: State<'_, OpenCdbSessions>,
    request: ModifyCardsRequest,
) -> Result<(), String> {
    cdb_cards_service::modify_cards(state.inner(), request)
}

#[tauri::command]
pub fn delete_cards(
    state: State<'_, OpenCdbSessions>,
    request: DeleteCardsRequest,
) -> Result<(), String> {
    cdb_cards_service::delete_cards(state.inner(), request)
}

#[tauri::command]
pub fn create_cdb_from_cards(request: CreateCdbFromCardsRequest) -> Result<(), String> {
    cdb_cards_service::create_cdb_from_cards(request)
}

#[tauri::command]
pub fn copy_card_assets(request: CopyCardAssetsRequest) -> Result<(), String> {
    cdb_assets_service::copy_card_assets(request)
}

#[tauri::command]
pub fn analyze_cdb_merge(
    request: AnalyzeCdbMergeRequest,
) -> Result<AnalyzeCdbMergeResponse, String> {
    cdb_merge_service::analyze_cdb_merge_paths(
        &request.source_paths,
        request.include_images,
        request.include_scripts,
    )
}

#[tauri::command]
pub fn collect_merge_sources_from_folder(
    request: CollectMergeSourcesFromFolderRequest,
) -> Result<Vec<MergeSourceItemDto>, String> {
    cdb_merge_service::collect_merge_sources_from_folder(&request.directory_path)
}

#[tauri::command]
pub fn execute_cdb_merge(
    request: ExecuteCdbMergeRequest,
) -> Result<ExecuteCdbMergeResponse, String> {
    cdb_merge_service::execute_cdb_merge(request)
}
