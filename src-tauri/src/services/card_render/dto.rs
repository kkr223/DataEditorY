use serde::{Deserialize, Serialize};
#[cfg(test)]
use ts_rs::TS;

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct RenderCardPayload {
    pub(crate) draft: CardRenderDraft,
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
pub(crate) struct CardRenderDraft {
    pub(crate) kind: CardRenderKind,
    pub(crate) identity: CardRenderIdentity,
    pub(crate) frame: CardRenderFrame,
    pub(crate) stats: CardRenderStats,
    pub(crate) localized_text: CardRenderLocalizedText,
    #[serde(default)]
    pub(crate) visual_style: CardRenderVisualStyle,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) foreground_layer: Option<CardRenderForegroundLayer>,
    pub(crate) output_options: CardRenderOutputOptions,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum CardRenderKind {
    Yugioh,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderIdentity {
    pub(crate) code: u32,
    pub(crate) alias: u32,
    pub(crate) rule_code: u32,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) password_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderFrame {
    #[serde(default)]
    pub(crate) setcode: Vec<u16>,
    #[serde(rename = "type")]
    pub(crate) type_: u32,
    pub(crate) level: u32,
    pub(crate) lscale: u32,
    pub(crate) rscale: u32,
    pub(crate) link_marker: u32,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderStats {
    pub(crate) attack: i32,
    pub(crate) defense: i32,
    pub(crate) race: u32,
    pub(crate) attribute: u32,
    #[cfg_attr(test, ts(type = "number"))]
    pub(crate) category: u64,
    pub(crate) ot: u32,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderLocalizedText {
    pub(crate) name: String,
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) strings: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderVisualStyle {
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) rare: Option<String>,
    #[serde(default)]
    pub(crate) name_color: CardRenderNameColor,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) name_gradient: Option<CardRenderTextGradient>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) name_shadow_color: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) name_shadow_gradient: Option<CardRenderTextGradient>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) package: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) copyright: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) laser: Option<String>,
    #[serde(default)]
    pub(crate) twentieth: bool,
    #[serde(default)]
    pub(crate) out_frame: bool,
    #[serde(default)]
    pub(crate) out_frame_effect_enabled: bool,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) out_frame_effect_background_color: Option<String>,
    #[serde(default)]
    #[cfg_attr(test, ts(optional))]
    pub(crate) out_frame_effect_opacity: Option<f32>,
}

#[derive(Debug, Deserialize, Default)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) enum CardRenderNameColor {
    #[default]
    Auto,
    Custom(String),
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderTextGradient {
    pub(crate) start: String,
    pub(crate) end: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderForegroundLayer {
    pub(crate) center_x: f32,
    pub(crate) center_y: f32,
    pub(crate) width: f32,
    pub(crate) height: f32,
    pub(crate) scale: f32,
    pub(crate) rotation: f32,
}

#[derive(Debug, Deserialize)]
#[cfg_attr(test, derive(TS))]
#[serde(rename_all = "camelCase")]
#[cfg_attr(test, ts(export_to = "render.ts"))]
pub(crate) struct CardRenderOutputOptions {
    pub(crate) language: String,
    pub(crate) scale: f32,
    pub(crate) description_first_line_compress: bool,
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
