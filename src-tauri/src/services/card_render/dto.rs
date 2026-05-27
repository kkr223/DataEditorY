use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct RenderCardPayload {
    pub(crate) base: CardBaseData,
    #[serde(default)]
    pub(crate) edits: Vec<DocumentEdit>,
    #[serde(default)]
    pub(crate) resources: CardRenderResources,
}

#[derive(Debug, Deserialize, Default)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderResources {
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) art_image: Option<CardRenderImageResource>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) foreground_image: Option<CardRenderImageResource>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) effect_mask: Option<CardRenderImageResource>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase", tag = "kind")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum CardRenderImageResource {
    DataUrl {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    FilePath {
        path: String,
    },
    ResourceToken {
        token: String,
    },
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct PrepareCardRenderResourceRequest {
    #[serde(rename = "dataUrl")]
    pub(crate) data_url: String,
}

#[derive(Debug, Serialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct PreparedCardRenderResource {
    pub(crate) token: String,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardBaseData {
    pub(crate) kind: CardRenderKind,
    pub(crate) code: u32,
    pub(crate) alias: u32,
    #[serde(default)]
    pub(crate) setcode: Vec<u16>,
    #[serde(rename = "type")]
    pub(crate) type_: u32,
    pub(crate) attack: i32,
    pub(crate) defense: i32,
    pub(crate) level: u32,
    pub(crate) race: u32,
    pub(crate) attribute: u32,
    #[cfg_attr(test, ts(type = "number"))]
    pub(crate) category: u64,
    pub(crate) ot: u32,
    pub(crate) name: String,
    pub(crate) desc: String,
    #[serde(default)]
    pub(crate) strings: Vec<String>,
    pub(crate) lscale: u32,
    pub(crate) rscale: u32,
    pub(crate) link_marker: u32,
    pub(crate) rule_code: u32,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) rare: Option<String>,
    pub(crate) language: String,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) font: Option<String>,
    pub(crate) scale: f32,
    #[serde(default)]
    pub(crate) twentieth: bool,
    #[serde(default)]
    pub(crate) twenty_fifth: bool,
    #[serde(default)]
    pub(crate) out_frame: bool,
    #[serde(default)]
    pub(crate) out_frame_name_block_enabled: bool,
    #[serde(default)]
    pub(crate) out_frame_effect_enabled: bool,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) out_frame_effect_box: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) out_frame_effect_background_color: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) out_frame_effect_opacity: Option<f32>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) radius: Option<bool>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) atk_bar: Option<bool>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) align: Option<TextAlignDto>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) description_align: Option<TextAlignDto>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum CardRenderKind {
    Yugioh,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum TextAlignDto {
    Left,
    Center,
    Right,
    Justify,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum ArtFitDto {
    Stretch,
    Cover,
    Contain,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase", tag = "kind")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum DocumentEdit {
    SetText {
        node_id: String,
        text: String,
    },
    SetTextFill {
        node_id: String,
        fill: TextFill,
    },
    SetTextShadow {
        node_id: String,
        shadow: Option<TextFill>,
    },
    SetFontWeight {
        node_id: String,
        weight: Option<u16>,
    },
    SetFontSize {
        node_id: String,
        size: u32,
    },
    SetLineHeight {
        node_id: String,
        height: f32,
    },
    SetFirstLineCompress {
        node_id: String,
        enabled: bool,
    },
    SetArtFit {
        node_id: String,
        fit: ArtFitDto,
    },
    SetArtCrop {
        node_id: String,
        crop: Option<ImageCropDto>,
    },
    SetArtScale {
        node_id: String,
        scale: f32,
    },
    SetArtOffset {
        node_id: String,
        offset_x: f32,
        offset_y: f32,
    },
    SetForegroundLayout {
        node_id: String,
        layout: ForegroundLayoutDto,
    },
    SetVisible {
        node_id: String,
        visible: bool,
    },
    SetFillRect {
        node_id: String,
        color: String,
        opacity: f32,
    },
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct TextFill {
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) color: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) gradient: Option<TextGradientDto>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct TextGradientDto {
    pub(crate) start: String,
    pub(crate) end: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct ImageCropDto {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct ForegroundLayoutDto {
    pub(crate) x: f32,
    pub(crate) y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) scale: f32,
    pub(crate) rotation: f32,
}

impl DocumentEdit {
    pub(crate) fn node_id(&self) -> &str {
        match self {
            Self::SetText { node_id, .. }
            | Self::SetTextFill { node_id, .. }
            | Self::SetTextShadow { node_id, .. }
            | Self::SetFontWeight { node_id, .. }
            | Self::SetFontSize { node_id, .. }
            | Self::SetLineHeight { node_id, .. }
            | Self::SetFirstLineCompress { node_id, .. }
            | Self::SetArtFit { node_id, .. }
            | Self::SetArtCrop { node_id, .. }
            | Self::SetArtScale { node_id, .. }
            | Self::SetArtOffset { node_id, .. }
            | Self::SetForegroundLayout { node_id, .. }
            | Self::SetVisible { node_id, .. }
            | Self::SetFillRect { node_id, .. } => node_id.as_str(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    const GENERATED_RENDER_TYPESCRIPT_PATH: &str = "../src/lib/types/generated/render.ts";
    const UPDATE_RENDER_TS_BINDINGS_ENV: &str = "UPDATE_RENDER_TS_BINDINGS";

    fn unique_export_dir() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after UNIX_EPOCH")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "dataeditory-render-bindings-{}-{timestamp}",
            std::process::id(),
        ))
    }

    fn export_render_typescript_bindings(out_dir: &Path) -> String {
        if out_dir.exists() {
            fs::remove_dir_all(out_dir).expect("remove stale TypeScript export dir");
        }
        fs::create_dir_all(out_dir).expect("create TypeScript export dir");

        RenderCardPayload::export_all_to(out_dir).expect("export render payload binding");
        PrepareCardRenderResourceRequest::export_all_to(out_dir)
            .expect("export prepare resource request binding");
        PreparedCardRenderResource::export_all_to(out_dir)
            .expect("export prepared resource binding");

        fs::read_to_string(out_dir.join("render.ts")).expect("read generated render binding")
    }

    fn normalize_newlines(value: &str) -> String {
        value.replace("\r\n", "\n")
    }

    #[test]
    fn generated_render_types_are_current() {
        let out_dir = unique_export_dir();
        let generated = export_render_typescript_bindings(&out_dir);
        let target_path =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(GENERATED_RENDER_TYPESCRIPT_PATH);

        if std::env::var_os(UPDATE_RENDER_TS_BINDINGS_ENV).is_some() {
            fs::create_dir_all(
                target_path
                    .parent()
                    .expect("generated binding path should have a parent"),
            )
            .expect("create generated binding directory");
            fs::write(&target_path, &generated).expect("update generated render binding");
        }

        let actual = fs::read_to_string(&target_path).expect("read committed render binding");
        assert_eq!(
            normalize_newlines(&actual),
            generated,
            "Rust render DTO TypeScript binding is stale. Re-run this test with {UPDATE_RENDER_TS_BINDINGS_ENV}=1 to update it.",
        );

        fs::remove_dir_all(out_dir).expect("remove TypeScript export dir");
    }
}
