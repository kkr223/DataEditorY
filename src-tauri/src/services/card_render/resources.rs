use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use base64::{engine::general_purpose, Engine as _};

use super::dto::CardRenderImageResource;

const MAX_DATA_URL_BYTES: usize = 16 * 1024 * 1024;

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(super) struct TempRenderFile {
    path: PathBuf,
}

impl TempRenderFile {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub(super) fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempRenderFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub(super) enum ResolvedRenderImage {
    TempFile(TempRenderFile),
    FilePath(PathBuf),
}

impl ResolvedRenderImage {
    pub(super) fn path(&self) -> &Path {
        match self {
            Self::TempFile(file) => file.path(),
            Self::FilePath(path) => path,
        }
    }
}

pub(super) fn resolve_image_resource(
    resource: &CardRenderImageResource,
) -> Result<ResolvedRenderImage, String> {
    match resource {
        CardRenderImageResource::DataUrl { data_url } => {
            write_data_url_to_temp_file(data_url).map(ResolvedRenderImage::TempFile)
        }
        CardRenderImageResource::FilePath { path } => {
            let trimmed = path.trim();
            if trimmed.is_empty() {
                return Err("Card image resource file path is empty".to_string());
            }

            let path = PathBuf::from(trimmed);
            if !path.is_absolute() {
                return Err("Card image resource file path must be absolute".to_string());
            }
            if !path.is_file() {
                return Err(format!(
                    "Card image resource file does not exist: {}",
                    path.display()
                ));
            }

            Ok(ResolvedRenderImage::FilePath(path))
        }
    }
}

fn write_data_url_to_temp_file(data_url: &str) -> Result<TempRenderFile, String> {
    let (mime, encoded) = parse_base64_data_url(data_url)?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|err| format!("Failed to decode card image data URL: {err}"))?;

    if bytes.len() > MAX_DATA_URL_BYTES {
        return Err("Card image data URL is too large".to_string());
    }

    let extension = data_url_extension(mime);
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "dataeditory-card-render-{}-{counter}.{extension}",
        std::process::id()
    ));

    fs::write(&path, bytes).map_err(|err| err.to_string())?;
    Ok(TempRenderFile::new(path))
}

fn parse_base64_data_url(data_url: &str) -> Result<(&str, &str), String> {
    let Some((header, body)) = data_url.split_once(',') else {
        return Err("Card image must be a data URL".to_string());
    };
    let Some(mime) = header.strip_prefix("data:") else {
        return Err("Card image must be a data URL".to_string());
    };
    let Some(mime) = mime.strip_suffix(";base64") else {
        return Err("Card image data URL must be base64-encoded".to_string());
    };

    Ok((mime, body))
}

fn data_url_extension(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/bmp" => "bmp",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_data_url_resource_to_temp_file_and_cleans_up() {
        let resource = CardRenderImageResource::DataUrl {
            data_url: "data:text/plain;base64,QQ==".to_string(),
        };

        let resolved = resolve_image_resource(&resource).unwrap();
        let path = resolved.path().to_path_buf();

        assert_eq!(fs::read(&path).unwrap(), b"A");
        drop(resolved);
        assert!(!path.exists());
    }

    #[test]
    fn resolves_file_path_resource_without_copying() {
        let dir = crate::test_helpers::make_temp_dir("card-render-resource");
        let file_path = dir.join("art.png");
        fs::write(&file_path, b"image").unwrap();
        let resource = CardRenderImageResource::FilePath {
            path: file_path.to_string_lossy().to_string(),
        };

        let resolved = resolve_image_resource(&resource).unwrap();

        assert_eq!(resolved.path(), file_path.as_path());
        drop(resolved);
        assert!(file_path.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
