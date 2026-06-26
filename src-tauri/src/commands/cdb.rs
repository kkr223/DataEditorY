use tauri::{AppHandle, Emitter};

use crate::{
    models::cdb::{
        AnalyzeCdbMergeRequest, AnalyzeCdbMergeResponse, CollectMergeSourcesFromFolderRequest,
        CopyCardAssetsRequest, CreateCdbFromCardsRequest, ExecuteCdbMergeRequest,
        ExecuteCdbMergeResponse, MergeSourceItemDto,
    },
    services::{
        assets as cdb_assets_service, cdb_cards as cdb_cards_service, merge as cdb_merge_service,
    },
    BACKGROUND_TASK_PROGRESS_EVENT,
};

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
pub async fn execute_cdb_merge(
    app: AppHandle,
    request: ExecuteCdbMergeRequest,
) -> Result<ExecuteCdbMergeResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let progress_app = app.clone();
        cdb_merge_service::execute_cdb_merge_with_progress(request, &mut |payload| {
            let _ = progress_app.emit(BACKGROUND_TASK_PROGRESS_EVENT, &payload);
        })
    })
    .await
    .map_err(|err| err.to_string())?
}
