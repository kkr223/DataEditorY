use std::{fs, path::Path, path::PathBuf};

use mime_guess::from_path;
use percent_encoding::percent_decode_str;
use tauri::http::{
    header::{ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE},
    Method, Request, Response, StatusCode,
};

use super::error::{MediaError, MediaResult};

const MEDIA_PROTOCOL_NAME: &str = "app-media";

fn media_protocol_error(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(CACHE_CONTROL, "no-cache")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn media_protocol_extension_allowed(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|ext| ext.to_str()),
        Some(ext)
            if matches!(
                ext.to_ascii_lowercase().as_str(),
                "png"
                    | "jpg"
                    | "jpeg"
                    | "webp"
                    | "gif"
                    | "bmp"
                    | "svg"
                    | "json"
                    | "ttf"
                    | "otf"
                    | "woff"
                    | "woff2"
            )
    )
}

fn decode_media_protocol_path(request: &Request<Vec<u8>>) -> MediaResult<PathBuf> {
    let raw_path = request.uri().path();
    let encoded_path = raw_path.strip_prefix('/').unwrap_or(raw_path);
    let decoded_path = percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|err| MediaError::invalid(format!("Invalid media path encoding: {err}")))?;
    let path = PathBuf::from(decoded_path.as_ref());

    if !path.is_absolute() {
        return Err(MediaError::invalid(
            "Only absolute media paths are supported",
        ));
    }

    Ok(path)
}

pub fn handle_media_protocol_request(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return media_protocol_error(StatusCode::METHOD_NOT_ALLOWED, "Unsupported method");
    }

    let path = match decode_media_protocol_path(&request) {
        Ok(path) => path,
        Err(error) => return media_protocol_error(StatusCode::BAD_REQUEST, &error.to_string()),
    };

    if !media_protocol_extension_allowed(&path) {
        return media_protocol_error(StatusCode::FORBIDDEN, "Unsupported media file type");
    }

    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return media_protocol_error(StatusCode::NOT_FOUND, "Media file not found");
        }
        Err(err) => {
            return media_protocol_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("Failed to read media metadata: {err}"),
            );
        }
    };

    if !metadata.is_file() {
        return media_protocol_error(StatusCode::FORBIDDEN, "Media path is not a file");
    }

    let content_type = from_path(&path)
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    let body = if request.method() == Method::HEAD {
        Vec::new()
    } else {
        match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(err) => {
                return media_protocol_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Failed to read media file: {err}"),
                );
            }
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type)
        .header(ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(CACHE_CONTROL, "no-cache")
        .body(body)
        .unwrap()
}

pub fn media_protocol_name() -> &'static str {
    MEDIA_PROTOCOL_NAME
}
