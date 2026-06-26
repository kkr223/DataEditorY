use crate::services::assets_check::{
    check_assets as check_assets_service, AssetCheckRequest, AssetCheckResponse,
};

#[tauri::command]
pub(crate) fn check_assets(request: AssetCheckRequest) -> Result<AssetCheckResponse, String> {
    check_assets_service(request)
}
