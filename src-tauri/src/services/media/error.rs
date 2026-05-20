use std::{
    error::Error,
    fmt, io,
    path::{Path, PathBuf},
    string::FromUtf8Error,
};

pub(crate) type MediaResult<T> = Result<T, MediaError>;

#[derive(Debug)]
pub(crate) enum MediaError {
    Io {
        action: &'static str,
        path: Option<PathBuf>,
        source: io::Error,
    },
    Image {
        action: &'static str,
        path: PathBuf,
        source: ::image::ImageError,
    },
    Utf8 {
        action: &'static str,
        path: Option<PathBuf>,
        source: FromUtf8Error,
    },
    InvalidInput(String),
    UnsupportedPlatform,
}

impl MediaError {
    pub(crate) fn io_at(action: &'static str, path: impl AsRef<Path>, source: io::Error) -> Self {
        Self::Io {
            action,
            path: Some(path.as_ref().to_path_buf()),
            source,
        }
    }

    pub(crate) fn image_at(
        action: &'static str,
        path: impl AsRef<Path>,
        source: ::image::ImageError,
    ) -> Self {
        Self::Image {
            action,
            path: path.as_ref().to_path_buf(),
            source,
        }
    }

    pub(crate) fn utf8_at(
        action: &'static str,
        path: impl AsRef<Path>,
        source: FromUtf8Error,
    ) -> Self {
        Self::Utf8 {
            action,
            path: Some(path.as_ref().to_path_buf()),
            source,
        }
    }

    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }
}

impl fmt::Display for MediaError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io {
                action,
                path: Some(path),
                source,
            } => write!(formatter, "{action} '{}': {source}", path.display()),
            Self::Io {
                action,
                path: None,
                source,
            } => write!(formatter, "{action}: {source}"),
            Self::Image {
                action,
                path,
                source,
            } => write!(formatter, "{action} '{}': {source}", path.display()),
            Self::Utf8 {
                action,
                path: Some(path),
                source,
            } => write!(formatter, "{action} '{}': {source}", path.display()),
            Self::Utf8 {
                action,
                path: None,
                source,
            } => write!(formatter, "{action}: {source}"),
            Self::InvalidInput(message) => formatter.write_str(message),
            Self::UnsupportedPlatform => formatter.write_str("Unsupported platform"),
        }
    }
}

impl Error for MediaError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io { source, .. } => Some(source),
            Self::Image { source, .. } => Some(source),
            Self::Utf8 { source, .. } => Some(source),
            Self::InvalidInput(_) | Self::UnsupportedPlatform => None,
        }
    }
}
