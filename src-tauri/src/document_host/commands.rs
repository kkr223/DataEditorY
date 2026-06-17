use std::{fs, path::Path};

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::{
    services::cdb_session,
    session::cdb::{basename, OpenCdbSessions},
};

use super::{
    cdb::{self, DocumentHostState},
    models::{
        CodecExportRequest, ProviderCommandResult, ProviderDocumentRequest,
        ProviderExecuteRequest, ProviderOpenRequest, ProviderOpenResponse, ProviderQueryRequest,
        ProviderSaveRequest, ProviderSaveResponse,
    },
};

const CDB_PROVIDER_ID: &str = "cdb.provider";
const CDB_CODEC_ID: &str = "cdb.codec";
const CARD_COLLECTION_TYPE: &str = "ygo.card-collection";

fn require_cdb_provider(provider_id: &str) -> Result<(), String> {
    if provider_id == CDB_PROVIDER_ID {
        return Ok(());
    }
    Err(format!("Unknown provider: {provider_id}"))
}

#[tauri::command]
pub fn provider_open(
    app: AppHandle,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderOpenRequest,
) -> Result<ProviderOpenResponse, String> {
    require_cdb_provider(&request.provider_id)?;
    if request.type_id != CARD_COLLECTION_TYPE {
        return Err(format!("Unsupported data type: {}", request.type_id));
    }
    let _ = request.input;
    let response = if request.create {
        cdb_session::create_unsaved_cdb_tab(&app, sessions.inner(), request.document_id)?
    } else {
        let source = request
            .source_uri
            .ok_or_else(|| "CDB provider requires a source path".to_string())?;
        cdb_session::open_cdb_tab(
            &app,
            sessions.inner(),
            request.document_id,
            source,
        )?
    };
    Ok(ProviderOpenResponse {
        title: response.name,
        metadata: json!({
            "total": response.cached_total,
            "initialCards": response.cached_cards,
        }),
    })
}

#[tauri::command]
pub fn provider_query(
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderQueryRequest,
) -> Result<Value, String> {
    require_cdb_provider(&request.provider_id)?;
    cdb::query(sessions.inner(), request.document_id, request.query)
}

#[tauri::command]
pub fn provider_execute(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderExecuteRequest,
) -> Result<ProviderCommandResult, String> {
    require_cdb_provider(&request.provider_id)?;
    cdb::execute(
        host.inner(),
        sessions.inner(),
        request.document_id,
        request.command,
    )
}

#[tauri::command]
pub fn provider_save(
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderSaveRequest,
) -> Result<ProviderSaveResponse, String> {
    require_cdb_provider(&request.provider_id)?;
    let source_uri = cdb::save(
        sessions.inner(),
        request.document_id,
        request.destination_uri,
    )?;
    Ok(ProviderSaveResponse { source_uri })
}

#[tauri::command]
pub fn provider_undo(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderDocumentRequest,
) -> Result<ProviderCommandResult, String> {
    require_cdb_provider(&request.provider_id)?;
    cdb::undo(host.inner(), sessions.inner(), request.document_id)
}

#[tauri::command]
pub fn provider_close(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderDocumentRequest,
) -> Result<(), String> {
    require_cdb_provider(&request.provider_id)?;
    host.clear(&request.document_id);
    cdb_session::close_cdb_tab(sessions.inner(), request.document_id)
}

#[tauri::command]
pub fn codec_export(request: CodecExportRequest) -> Result<Value, String> {
    if request.codec_id != CDB_CODEC_ID {
        return Err(format!("Unknown export codec: {}", request.codec_id));
    }
    let source = request
        .source_uri
        .ok_or_else(|| "CDB export requires a source path".to_string())?;
    let _ = request.document_id;
    let _ = request.options;
    let destination = Path::new(&request.destination_uri);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    fs::copy(&source, destination).map_err(|err| err.to_string())?;
    Ok(json!({
        "path": request.destination_uri,
        "name": basename(destination.to_string_lossy().as_ref()),
    }))
}
