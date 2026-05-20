use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};

use base64::{engine::general_purpose, Engine as _};
use tauri::{AppHandle, Manager};

use super::dto::{
    CardRenderImageResource, PrepareCardRenderResourceRequest, PreparedCardRenderResource,
};
use super::error::{RenderError, RenderResult};

const MAX_DATA_URL_BYTES: usize = 16 * 1024 * 1024;

static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Default)]
pub(crate) struct RenderResourceRegistry {
    inner: Arc<RenderResourceRegistryInner>,
}

#[derive(Default)]
struct RenderResourceRegistryInner {
    entries: Mutex<HashMap<String, RenderResourceEntry>>,
}

struct RenderResourceEntry {
    path: PathBuf,
    active_leases: usize,
    pending_release: bool,
}

pub(super) struct RegisteredRenderResourceLease {
    token: String,
    path: PathBuf,
    registry: RenderResourceRegistry,
}

impl RegisteredRenderResourceLease {
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for RegisteredRenderResourceLease {
    fn drop(&mut self) {
        self.registry.release_lease(&self.token);
    }
}

impl Drop for RenderResourceRegistryInner {
    fn drop(&mut self) {
        let Ok(entries) = self.entries.get_mut() else {
            return;
        };
        for (_, entry) in entries.drain() {
            let _ = fs::remove_file(entry.path);
        }
    }
}

impl RenderResourceRegistry {
    pub(super) fn prepare_data_url(
        &self,
        data_url: &str,
    ) -> RenderResult<PreparedCardRenderResource> {
        let (token, path) = write_data_url_to_temp_path(data_url)?;
        let mut entries = self
            .inner
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        entries.insert(
            token.clone(),
            RenderResourceEntry {
                path,
                active_leases: 0,
                pending_release: false,
            },
        );
        Ok(PreparedCardRenderResource { token })
    }

    fn lease(&self, token: &str) -> RenderResult<RegisteredRenderResourceLease> {
        let mut entries = self
            .inner
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let entry = entries.get_mut(token).ok_or_else(|| {
            RenderError::invalid(format!(
                "Card render resource is missing or expired: {token}"
            ))
        })?;
        if !entry.path.is_file() {
            return Err(RenderError::invalid(format!(
                "Card render resource file does not exist: {}",
                entry.path.display()
            )));
        }

        entry.active_leases += 1;
        Ok(RegisteredRenderResourceLease {
            token: token.to_string(),
            path: entry.path.clone(),
            registry: self.clone(),
        })
    }

    pub(super) fn release(&self, token: &str) -> bool {
        let mut entries = self
            .inner
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(entry) = entries.get_mut(token) else {
            return false;
        };

        if entry.active_leases > 0 {
            entry.pending_release = true;
            return true;
        }

        let Some(entry) = entries.remove(token) else {
            return false;
        };
        let _ = fs::remove_file(entry.path);
        true
    }

    fn release_lease(&self, token: &str) {
        let mut entries = self
            .inner
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(entry) = entries.get_mut(token) else {
            return;
        };

        entry.active_leases = entry.active_leases.saturating_sub(1);
        if entry.active_leases > 0 || !entry.pending_release {
            return;
        }

        let Some(entry) = entries.remove(token) else {
            return;
        };
        let _ = fs::remove_file(entry.path);
    }
}

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
    Registered(RegisteredRenderResourceLease),
}

impl ResolvedRenderImage {
    pub(super) fn path(&self) -> &Path {
        match self {
            Self::TempFile(file) => file.path(),
            Self::FilePath(path) => path,
            Self::Registered(lease) => lease.path(),
        }
    }
}

pub(super) fn resolve_image_resource(
    app: &AppHandle,
    resource: &CardRenderImageResource,
) -> RenderResult<ResolvedRenderImage> {
    match resource {
        CardRenderImageResource::DataUrl { data_url } => {
            write_data_url_to_temp_file(data_url).map(ResolvedRenderImage::TempFile)
        }
        CardRenderImageResource::FilePath { path } => {
            resolve_file_path_resource(path).map(ResolvedRenderImage::FilePath)
        }
        CardRenderImageResource::ResourceToken { token } => app
            .state::<RenderResourceRegistry>()
            .lease(token)
            .map(ResolvedRenderImage::Registered),
    }
}

pub(super) fn prepare_image_resource(
    app: &AppHandle,
    request: PrepareCardRenderResourceRequest,
) -> RenderResult<PreparedCardRenderResource> {
    app.state::<RenderResourceRegistry>()
        .prepare_data_url(&request.data_url)
}

pub(super) fn release_image_resource(app: &AppHandle, token: String) -> RenderResult<()> {
    app.state::<RenderResourceRegistry>().release(token.trim());
    Ok(())
}

fn write_data_url_to_temp_file(data_url: &str) -> RenderResult<TempRenderFile> {
    let (_token, path) = write_data_url_to_temp_path(data_url)?;
    Ok(TempRenderFile::new(path))
}

fn resolve_file_path_resource(path: &str) -> RenderResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(RenderError::invalid(
            "Card image resource file path is empty",
        ));
    }

    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(RenderError::invalid(
            "Card image resource file path must be absolute",
        ));
    }
    if !path.is_file() {
        return Err(RenderError::invalid(format!(
            "Card image resource file does not exist: {}",
            path.display()
        )));
    }

    Ok(path)
}

fn write_data_url_to_temp_path(data_url: &str) -> RenderResult<(String, PathBuf)> {
    let (mime, encoded) = parse_base64_data_url(data_url)?;
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|source| RenderError::DecodeDataUrl { source })?;

    if bytes.len() > MAX_DATA_URL_BYTES {
        return Err(RenderError::invalid("Card image data URL is too large"));
    }

    let extension = data_url_extension(mime);
    let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let token = format!("{}-{counter}", std::process::id());
    let path = std::env::temp_dir().join(format!("dataeditory-card-render-{token}.{extension}"));

    fs::write(&path, bytes)
        .map_err(|err| RenderError::io_at("Failed to write card image temp file", &path, err))?;
    Ok((token, path))
}

fn parse_base64_data_url(data_url: &str) -> RenderResult<(&str, &str)> {
    let Some((header, body)) = data_url.split_once(',') else {
        return Err(RenderError::invalid("Card image must be a data URL"));
    };
    let Some(mime) = header.strip_prefix("data:") else {
        return Err(RenderError::invalid("Card image must be a data URL"));
    };
    let Some(mime) = mime.strip_suffix(";base64") else {
        return Err(RenderError::invalid(
            "Card image data URL must be base64-encoded",
        ));
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
        let file = write_data_url_to_temp_file("data:text/plain;base64,QQ==").unwrap();
        let path = file.path().to_path_buf();

        assert_eq!(fs::read(&path).unwrap(), b"A");
        drop(file);
        assert!(!path.exists());
    }

    #[test]
    fn resolves_file_path_resource_without_copying() {
        let dir = crate::test_helpers::make_temp_dir("card-render-resource");
        let file_path = dir.join("art.png");
        fs::write(&file_path, b"image").unwrap();
        let resolved = resolve_file_path_resource(&file_path.to_string_lossy()).unwrap();

        assert_eq!(resolved, file_path);
        assert!(file_path.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn registry_releases_prepared_resource_after_active_lease_drops() {
        let registry = RenderResourceRegistry::default();
        let prepared = registry
            .prepare_data_url("data:text/plain;base64,QQ==")
            .unwrap();
        let lease = registry.lease(&prepared.token).unwrap();
        let path = lease.path().to_path_buf();

        assert!(path.exists());
        assert!(registry.release(&prepared.token));
        assert!(path.exists());
        drop(lease);
        assert!(!path.exists());
    }
}
