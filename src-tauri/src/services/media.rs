use image::{codecs::jpeg::JpegEncoder, GenericImageView};
use mime_guess::from_path;
use percent_encoding::percent_decode_str;
use std::{
    collections::HashSet,
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
const STRINGS_DIR_NAME: &str = "strings";
const LEGACY_STRINGS_FILE_NAME: &str = "strings.conf";
const MAX_STRINGS_TEXT_FILE_BYTES: u64 = 512 * 1024;

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

fn strings_dir_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join(STRINGS_DIR_NAME));
        candidates.push(resource_dir.join(STRINGS_DIR_NAME));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(STRINGS_DIR_NAME));
        candidates.push(current_dir.join("static").join(STRINGS_DIR_NAME));
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join(STRINGS_DIR_NAME),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(STRINGS_DIR_NAME));
            candidates.push(exe_dir.join("resources").join(STRINGS_DIR_NAME));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join(STRINGS_DIR_NAME));
                candidates.push(parent.join("resources").join(STRINGS_DIR_NAME));
            }
        }
    }

    dedupe_candidate_paths(candidates)
}

fn legacy_strings_file_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join(LEGACY_STRINGS_FILE_NAME));
        candidates.push(resource_dir.join(LEGACY_STRINGS_FILE_NAME));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(LEGACY_STRINGS_FILE_NAME));
        candidates.push(current_dir.join("static").join(LEGACY_STRINGS_FILE_NAME));
        candidates.push(
            current_dir
                .join("static")
                .join("resources")
                .join(LEGACY_STRINGS_FILE_NAME),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join(LEGACY_STRINGS_FILE_NAME));
            candidates.push(exe_dir.join("resources").join(LEGACY_STRINGS_FILE_NAME));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join(LEGACY_STRINGS_FILE_NAME));
                candidates.push(parent.join("resources").join(LEGACY_STRINGS_FILE_NAME));
            }
        }
    }

    dedupe_candidate_paths(candidates)
}

fn dedupe_candidate_paths(candidates: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();

    for candidate in candidates {
        let resolved = fs::canonicalize(&candidate).unwrap_or_else(|_| candidate.clone());
        if seen.insert(resolved) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn read_strings_text_file(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|err| err.to_string())?;
    if !metadata.is_file() {
        return Err("Path is not a regular file".to_string());
    }
    if metadata.len() > MAX_STRINGS_TEXT_FILE_BYTES {
        return Err(format!(
            "File exceeds the {} byte safety limit",
            MAX_STRINGS_TEXT_FILE_BYTES
        ));
    }

    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    if bytes.contains(&0) {
        return Err("Binary-looking file detected".to_string());
    }

    let text = String::from_utf8(bytes).map_err(|err| err.to_string())?;
    Ok(text.replace("\r\n", "\n"))
}

fn read_strings_directory(dir: &Path) -> Result<Vec<String>, String> {
    let metadata = fs::metadata(dir).map_err(|err| err.to_string())?;
    if !metadata.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let canonical_dir = fs::canonicalize(dir).map_err(|err| err.to_string())?;
    let mut entries = fs::read_dir(&canonical_dir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    entries.sort_by(|a, b| {
        a.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .cmp(
                &b.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default(),
            )
    });

    let mut contents = Vec::new();
    for path in entries {
        let Ok(canonical_path) = fs::canonicalize(&path) else {
            continue;
        };
        if !canonical_path.starts_with(&canonical_dir) {
            continue;
        }
        let Ok(file_type) = fs::metadata(&canonical_path).map(|metadata| metadata.file_type()) else {
            continue;
        };
        if !file_type.is_file() {
            continue;
        }

        if let Ok(content) = read_strings_text_file(&canonical_path) {
            if !content.trim().is_empty() {
                contents.push(content);
            }
        }
    }

    Ok(contents)
}

pub fn load_strings_conf(app: &AppHandle) -> Result<String, String> {
    let mut aggregated = Vec::new();

    for dir in strings_dir_candidates(app) {
        if !dir.exists() {
            continue;
        }

        if let Ok(mut contents) = read_strings_directory(&dir) {
            aggregated.append(&mut contents);
        }
    }

    if !aggregated.is_empty() {
        return Ok(aggregated.join("\n"));
    }

    for path in legacy_strings_file_candidates(app) {
        if path.exists() {
            return read_strings_text_file(&path);
        }
    }

    Err("No valid strings text files found in configured locations".to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let unique = format!(
            "dataeditory-media-{label}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let path = std::env::temp_dir().join(unique);
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn reads_and_sorts_valid_text_files_from_strings_directory() {
        let root = make_temp_dir("strings-dir");
        fs::write(root.join("b.conf"), "!setname 0x2 Beta").unwrap();
        fs::write(root.join("a.txt"), "!setname 0x1 Alpha").unwrap();
        fs::write(root.join("binary.bin"), [0u8, 159, 146, 150]).unwrap();
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("ignored.txt"), "!setname 0x3 Gamma").unwrap();

        let result = read_strings_directory(&root).unwrap();

        assert_eq!(result.len(), 2);
        assert!(result[0].contains("Alpha"));
        assert!(result[1].contains("Beta"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_oversized_text_files() {
        let root = make_temp_dir("strings-size");
        let path = root.join("huge.conf");
        fs::write(&path, vec![b'a'; (MAX_STRINGS_TEXT_FILE_BYTES as usize) + 1]).unwrap();

        let result = read_strings_text_file(&path);

        assert!(result.is_err());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn dedupes_canonical_candidate_paths() {
        let root = make_temp_dir("strings-dedupe");
        let canonical = fs::canonicalize(&root).unwrap();
        let via_dot = root.join(".");

        let result = dedupe_candidate_paths(vec![root.clone(), via_dot, canonical.clone()]);

        assert_eq!(result.len(), 1);
        assert_eq!(fs::canonicalize(&result[0]).unwrap(), canonical);

        let _ = fs::remove_dir_all(&root);
    }
}
