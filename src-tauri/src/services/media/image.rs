use std::{
    fs,
    io::{BufWriter, Write},
    path::Path,
};

use ::image::{codecs::jpeg::JpegEncoder, GenericImageView};

use super::error::{MediaError, MediaResult};

fn ensure_parent_dir(path: &Path, action: &'static str) -> MediaResult<()> {
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return Ok(());
    };

    fs::create_dir_all(parent).map_err(|err| MediaError::io_at(action, parent, err))
}

pub fn list_image_folder_entries(path: String) -> MediaResult<Vec<String>> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(MediaError::invalid("Folder does not exist"));
    }
    if !dir.is_dir() {
        return Err(MediaError::invalid("Path is not a folder"));
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(dir)
        .map_err(|err| MediaError::io_at("Failed to read image folder", dir, err))?
    {
        let item =
            item.map_err(|err| MediaError::io_at("Failed to read image folder entry", dir, err))?;
        let item_path = item.path();
        if !item_path.is_file() {
            continue;
        }

        let extension = item_path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase());
        let Some(extension) = extension else {
            continue;
        };

        if !matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "bmp" | "webp") {
            continue;
        }

        if let Some(stem) = item_path.file_stem().and_then(|stem| stem.to_str()) {
            let trimmed = stem.trim();
            if !trimmed.is_empty() {
                entries.push(trimmed.to_string());
            }
        }
    }

    entries.sort_unstable();
    entries.dedup();
    Ok(entries)
}

pub fn import_card_image(
    src: String,
    dest: String,
    max_width: u32,
    max_height: u32,
    quality: u8,
) -> MediaResult<()> {
    let image = ::image::open(&src)
        .map_err(|err| MediaError::image_at("Failed to open image", &src, err))?;
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Err(MediaError::invalid("Image has invalid dimensions"));
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
            ::image::imageops::FilterType::Lanczos3,
        )
    };

    let target = Path::new(&dest);
    ensure_parent_dir(
        target,
        "Failed to create parent directory for imported image",
    )?;

    let file = fs::File::create(target)
        .map_err(|err| MediaError::io_at("Failed to create imported image", target, err))?;
    let mut writer = BufWriter::new(file);
    let mut encoder = JpegEncoder::new_with_quality(&mut writer, quality.clamp(1, 100));
    encoder
        .encode_image(&resized)
        .map_err(|err| MediaError::image_at("Failed to encode imported image", target, err))?;
    writer
        .flush()
        .map_err(|err| MediaError::io_at("Failed to flush imported image", target, err))
}
