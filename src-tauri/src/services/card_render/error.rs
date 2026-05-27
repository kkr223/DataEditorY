use std::{
    error::Error,
    fmt, io,
    path::{Path, PathBuf},
};

pub(crate) type RenderResult<T> = Result<T, RenderError>;

#[derive(Debug)]
pub(crate) enum RenderError {
    Io {
        action: &'static str,
        path: PathBuf,
        source: io::Error,
    },
    DecodeDataUrl {
        source: base64::DecodeError,
    },
    Renderer {
        action: &'static str,
        message: String,
    },
    BundleMissing,
    BundleLoad {
        path: PathBuf,
        message: String,
    },
    InvalidInput(String),
}

impl RenderError {
    pub(crate) fn io_at(action: &'static str, path: impl AsRef<Path>, source: io::Error) -> Self {
        Self::Io {
            action,
            path: path.as_ref().to_path_buf(),
            source,
        }
    }

    pub(crate) fn renderer(action: &'static str, message: impl Into<String>) -> Self {
        Self::Renderer {
            action,
            message: message.into(),
        }
    }

    pub(crate) fn bundle_load(path: impl AsRef<Path>, message: impl Into<String>) -> Self {
        Self::BundleLoad {
            path: path.as_ref().to_path_buf(),
            message: message.into(),
        }
    }

    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }
}

impl fmt::Display for RenderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                action,
                path,
                source,
            } => write!(formatter, "{action} '{}': {source}", path.display()),
            Self::DecodeDataUrl { source } => {
                write!(formatter, "Failed to decode card image data URL: {source}")
            }
            Self::Renderer { action, message } => write!(formatter, "{action}: {message}"),
            Self::BundleMissing => formatter.write_str("Unable to locate yugioh renderer bundle"),
            Self::BundleLoad { path, message } => write!(
                formatter,
                "Failed to load yugioh renderer bundle at {}: {message}",
                path.display()
            ),
            Self::InvalidInput(message) => formatter.write_str(message),
        }
    }
}

impl Error for RenderError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::DecodeDataUrl { source } => Some(source),
            Self::Renderer { .. }
            | Self::BundleMissing
            | Self::BundleLoad { .. }
            | Self::InvalidInput(_) => None,
        }
    }
}
