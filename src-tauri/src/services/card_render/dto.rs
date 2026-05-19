use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenderCardPayload {
    pub(crate) draft: CardRenderDraft,
    #[serde(default)]
    pub(crate) resources: CardRenderResources,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderResources {
    #[serde(default)]
    pub(crate) art_image: Option<CardRenderImageResource>,
    #[serde(default)]
    pub(crate) foreground_image: Option<CardRenderImageResource>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum CardRenderImageResource {
    DataUrl {
        #[serde(rename = "dataUrl")]
        data_url: String,
    },
    FilePath {
        path: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderDraft {
    pub(crate) kind: CardRenderKind,
    pub(crate) identity: CardRenderIdentity,
    pub(crate) frame: CardRenderFrame,
    pub(crate) stats: CardRenderStats,
    pub(crate) localized_text: CardRenderLocalizedText,
    #[serde(default)]
    pub(crate) visual_style: CardRenderVisualStyle,
    pub(crate) output_options: CardRenderOutputOptions,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CardRenderKind {
    Yugioh,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderIdentity {
    pub(crate) code: u32,
    pub(crate) alias: u32,
    pub(crate) rule_code: u32,
    #[serde(default)]
    pub(crate) password_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderStats {
    pub(crate) attack: i32,
    pub(crate) defense: i32,
    pub(crate) race: u32,
    pub(crate) attribute: u32,
    pub(crate) category: u64,
    pub(crate) ot: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderLocalizedText {
    pub(crate) name: String,
    pub(crate) description: String,
    #[serde(default)]
    pub(crate) strings: Vec<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderVisualStyle {
    #[serde(default)]
    pub(crate) rare: Option<String>,
    #[serde(default)]
    pub(crate) name_color: CardRenderNameColor,
    #[serde(default)]
    pub(crate) name_gradient: Option<CardRenderTextGradient>,
    #[serde(default)]
    pub(crate) name_shadow_color: Option<String>,
    #[serde(default)]
    pub(crate) name_shadow_gradient: Option<CardRenderTextGradient>,
    #[serde(default)]
    pub(crate) package: Option<String>,
    #[serde(default)]
    pub(crate) copyright: Option<String>,
    #[serde(default)]
    pub(crate) laser: Option<String>,
    #[serde(default)]
    pub(crate) twentieth: bool,
    #[serde(default)]
    pub(crate) out_frame: bool,
    #[serde(default)]
    pub(crate) out_frame_effect_enabled: bool,
    #[serde(default)]
    pub(crate) out_frame_effect_background_color: Option<String>,
    #[serde(default)]
    pub(crate) out_frame_effect_opacity: Option<f32>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub(crate) enum CardRenderNameColor {
    #[default]
    Auto,
    Custom(String),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderTextGradient {
    pub(crate) start: String,
    pub(crate) end: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CardRenderOutputOptions {
    pub(crate) language: String,
    pub(crate) scale: f32,
    pub(crate) description_first_line_compress: bool,
}
