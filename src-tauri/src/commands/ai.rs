use tauri::AppHandle;

#[cfg(feature = "ai")]
use crate::services;

#[cfg(feature = "ai")]
#[tauri::command]
pub(crate) async fn list_ai_models(
    app: AppHandle,
    request: services::ai::ListAiModelsRequest,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || services::ai::list_ai_models(&app, request))
        .await
        .map_err(|err| err.to_string())?
}

#[cfg(feature = "ai")]
#[tauri::command]
pub(crate) async fn request_ai_chat_completion(
    app: AppHandle,
    request: services::ai::AiChatCompletionRequest,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        services::ai::request_chat_completion(&app, request)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub(crate) async fn list_ai_models(
    _app: AppHandle,
    _request: serde_json::Value,
) -> Result<Vec<String>, String> {
    Err("AI features are not available in this build.".to_string())
}

#[cfg(not(feature = "ai"))]
#[tauri::command]
pub(crate) async fn request_ai_chat_completion(
    _app: AppHandle,
    _request: serde_json::Value,
) -> Result<serde_json::Value, String> {
    Err("AI features are not available in this build.".to_string())
}
