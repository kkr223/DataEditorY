use std::{fs, path::Path};

use serde_json::{json, Value};
use tauri::{AppHandle, State};

use crate::{
    models::cdb::CardDto,
    services::cdb_session,
    session::cdb::{basename, OpenCdbSessions},
};

use super::{
    cdb::{self, DocumentHostState},
    models::{
        CodecExportRequest, ProviderCommandResult, ProviderDocumentRequest, ProviderExecuteRequest,
        ProviderOpenRequest, ProviderOpenResponse, ProviderQueryRequest, ProviderSaveRequest,
        ProviderSaveResponse,
    },
};

// CDB commands take std::sync::Mutex locks and perform disk I/O. They must run
// on the command threadpool: blocking the UI thread while an async query owns a
// session lock can prevent that query's IPC response from being delivered and
// deadlock tab switching/closing.
const CDB_PROVIDER_ID: &str = "cdb.provider";
const CDB_CODEC_ID: &str = "cdb.codec";
const CARD_COLLECTION_TYPE: &str = "ygo.card-collection";

fn require_cdb_provider(provider_id: &str) -> Result<(), String> {
    if provider_id == CDB_PROVIDER_ID {
        return Ok(());
    }
    Err(format!("Unknown provider: {provider_id}"))
}

#[tauri::command(async)]
pub fn provider_open(
    app: AppHandle,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderOpenRequest,
) -> Result<ProviderOpenResponse, String> {
    require_cdb_provider(&request.provider_id)?;
    if request.type_id != CARD_COLLECTION_TYPE {
        return Err(format!("Unsupported data type: {}", request.type_id));
    }
    let response = if request.create {
        let initial_cards = request
            .input
            .map(serde_json::from_value::<Vec<CardDto>>)
            .transpose()
            .map_err(|err| format!("Invalid initial CDB data: {err}"))?
            .unwrap_or_default();
        cdb_session::create_unsaved_cdb_tab(
            &app,
            sessions.inner(),
            request.document_id,
            initial_cards,
        )?
    } else {
        let source = request
            .source_uri
            .ok_or_else(|| "CDB provider requires a source path".to_string())?;
        cdb_session::open_cdb_tab(&app, sessions.inner(), request.document_id, source)?
    };
    Ok(ProviderOpenResponse {
        title: response.name,
        metadata: json!({
            "total": response.cached_total,
            "initialCards": response.cached_cards,
        }),
    })
}

#[tauri::command(async)]
pub fn provider_query(
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderQueryRequest,
) -> Result<Value, String> {
    require_cdb_provider(&request.provider_id)?;
    cdb::query(sessions.inner(), request.document_id, request.query)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn provider_save(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderSaveRequest,
) -> Result<ProviderSaveResponse, String> {
    require_cdb_provider(&request.provider_id)?;
    let source_uri = cdb::save(
        host.inner(),
        sessions.inner(),
        request.document_id,
        request.destination_uri,
    )?;
    Ok(ProviderSaveResponse { source_uri })
}

#[tauri::command(async)]
pub fn provider_undo(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderDocumentRequest,
) -> Result<ProviderCommandResult, String> {
    require_cdb_provider(&request.provider_id)?;
    cdb::undo(host.inner(), sessions.inner(), request.document_id)
}

#[tauri::command(async)]
pub fn provider_close(
    host: State<'_, DocumentHostState>,
    sessions: State<'_, OpenCdbSessions>,
    request: ProviderDocumentRequest,
) -> Result<(), String> {
    require_cdb_provider(&request.provider_id)?;
    host.clear(&request.document_id)?;
    cdb_session::close_cdb_tab(sessions.inner(), request.document_id)
}

#[tauri::command(async)]
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
