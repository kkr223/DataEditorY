use image::{codecs::jpeg::JpegEncoder, GenericImageView};
use mime_guess::from_path;
use percent_encoding::percent_decode_str;
use std::{
    fs,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    process::Command,
};
use tauri::http::{
    header::{ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE},
    Method, Request, Response, StatusCode,
};
use tauri::{AppHandle, Manager};

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

fn decode_media_protocol_path(request: &Request<Vec<u8>>) -> Result<PathBuf, String> {
    let raw_path = request.uri().path();
    let encoded_path = raw_path.strip_prefix('/').unwrap_or(raw_path);
    let decoded_path = percent_decode_str(encoded_path)
        .decode_utf8()
        .map_err(|err| err.to_string())?;
    let path = PathBuf::from(decoded_path.as_ref());

    if !path.is_absolute() {
        return Err("Only absolute media paths are supported".to_string());
    }

    Ok(path)
}

pub fn handle_media_protocol_request(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return media_protocol_error(StatusCode::METHOD_NOT_ALLOWED, "Unsupported method");
    }

    let path = match decode_media_protocol_path(&request) {
        Ok(path) => path,
        Err(message) => return media_protocol_error(StatusCode::BAD_REQUEST, &message),
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

pub fn read_cdb(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|err| err.to_string())
}

pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|err| err.to_string())
}

pub fn write_cdb(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, data).map_err(|err| err.to_string())
}

pub fn write_file(path: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, data).map_err(|err| err.to_string())
}

pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

pub fn copy_image(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&dest).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::copy(&src, &dest).map_err(|err| err.to_string())?;
    Ok(())
}

pub fn read_image(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|err| err.to_string())
}

pub fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> Result<(), String> {
    let image = image::open(&src).map_err(|err| err.to_string())?;
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err("Image has invalid dimensions".to_string());
    }

    let width_scale = max_width as f32 / width as f32;
    let height_scale = max_height as f32 / height as f32;
    let scale = width_scale.min(height_scale).min(1.0);
    let target_width = ((width as f32 * scale).round() as u32).max(1);
    let target_height = ((height as f32 * scale).round() as u32).max(1);

    let resized = if target_width == width && target_height == height {
        image
    } else {
        image.resize(
            target_width,
            target_height,
            image::imageops::FilterType::Lanczos3,
        )
    };

    if let Some(parent) = Path::new(&dest).parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let file = fs::File::create(&dest).map_err(|err| err.to_string())?;
    let mut writer = BufWriter::new(file);
    let mut encoder = JpegEncoder::new_with_quality(&mut writer, quality.clamp(1, 100));
    encoder
        .encode_image(&resized)
        .map_err(|err| err.to_string())?;
    writer.flush().map_err(|err| err.to_string())
}

pub fn load_strings_conf(app: &AppHandle) -> Result<String, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("strings.conf"));
        candidates.push(resource_dir.join("strings.conf"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("strings.conf"));
        candidates.push(current_dir.join("static").join("strings.conf"));
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join("strings.conf"),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("strings.conf"));
            candidates.push(exe_dir.join("resources").join("strings.conf"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("strings.conf"));
                candidates.push(parent.join("resources").join("strings.conf"));
            }
        }
    }

    for path in candidates {
        if path.exists() {
            return fs::read_to_string(&path).map_err(|err| err.to_string());
        }
    }

    Err("strings.conf not found in external locations".to_string())
}

fn vscode_candidates() -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("code")];

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            Path::new(&local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files) = std::env::var("ProgramFiles") {
        candidates.push(
            Path::new(&program_files)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            Path::new(&program_files_x86)
                .join("Microsoft VS Code")
                .join("Code.exe"),
        );
    }

    candidates
}

fn open_with_preferred_editor(path: &Path) -> Result<(), String> {
    for candidate in vscode_candidates() {
        let mut command = Command::new(&candidate);
        if command.arg("-g").arg(path).spawn().is_ok() {
            return Ok(());
        }
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}

pub fn open_in_system_editor(path: String) -> Result<(), String> {
    open_with_preferred_editor(Path::new(&path))
}

pub fn open_in_default_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(Path::new(&path).as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(Path::new(&path).as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(Path::new(&path).as_os_str())
            .spawn()
            .map_err(|err| err.to_string())?;
        return Ok(());
    }
}

pub(crate) fn normalize_cdb_path(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?;
    if !extension.eq_ignore_ascii_case("cdb") || !path.is_file() {
        return None;
    }

    let resolved = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    Some(resolved.to_string_lossy().to_string())
}

fn dedupe_paths(paths: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::new();
    for path in paths {
        if !deduped.contains(&path) {
            deduped.push(path);
        }
    }
    deduped
}

pub(crate) fn collect_cdb_paths_from_args<I>(args: I) -> Vec<String>
where
    I: IntoIterator,
    I::Item: Into<std::ffi::OsString>,
{
    dedupe_paths(
        args.into_iter()
            .filter_map(|arg| {
                let value: std::ffi::OsString = arg.into();
                normalize_cdb_path(Path::new(&value))
            })
            .collect(),
    )
}
