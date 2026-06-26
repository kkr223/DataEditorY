use crate::services::lua_replace::{
    apply_lua_replace as apply_lua_replace_service,
    preview_lua_replace as preview_lua_replace_service, LuaReplacePreview, LuaReplaceRequest,
};

#[tauri::command]
pub(crate) fn preview_lua_replace(request: LuaReplaceRequest) -> Result<LuaReplacePreview, String> {
    preview_lua_replace_service(request)
}

#[tauri::command]
pub(crate) fn apply_lua_replace(request: LuaReplaceRequest) -> Result<LuaReplacePreview, String> {
    apply_lua_replace_service(request)
}
