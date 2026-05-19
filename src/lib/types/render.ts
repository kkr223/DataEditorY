export type CardRenderKind = 'yugioh';

export type CardRenderTextGradient = {
  start: string;
  end: string;
};

export type CardRenderNameColor =
  | { kind: 'auto' }
  | { kind: 'custom'; value: string };

export type CardRenderIdentity = {
  code: number;
  alias: number;
  ruleCode: number;
  passwordText?: string;
};

export type CardRenderFrame = {
  setcode: number[];
  type: number;
  level: number;
  lscale: number;
  rscale: number;
  linkMarker: number;
};

export type CardRenderStats = {
  attack: number;
  defense: number;
  race: number;
  attribute: number;
  category: number;
  ot: number;
};

export type CardRenderLocalizedText = {
  name: string;
  description: string;
  strings: string[];
};

export type CardRenderVisualStyle = {
  rare?: string;
  nameColor: CardRenderNameColor;
  nameGradient?: CardRenderTextGradient;
  nameShadowColor?: string;
  nameShadowGradient?: CardRenderTextGradient;
  package?: string;
  copyright?: string;
  laser?: string;
  twentieth: boolean;
  outFrame: boolean;
  outFrameEffectEnabled: boolean;
  outFrameEffectBackgroundColor?: string;
  outFrameEffectOpacity?: number;
};

export type CardRenderOutputOptions = {
  language: string;
  scale: number;
  descriptionFirstLineCompress: boolean;
};

export type CardRenderDraft = {
  kind: CardRenderKind;
  identity: CardRenderIdentity;
  frame: CardRenderFrame;
  stats: CardRenderStats;
  localizedText: CardRenderLocalizedText;
  visualStyle: CardRenderVisualStyle;
  outputOptions: CardRenderOutputOptions;
};

export type CardRenderImageResource =
  | { kind: 'dataUrl'; dataUrl: string }
  | { kind: 'filePath'; path: string }
  | { kind: 'resourceToken'; token: string };

export type CardRenderResources = {
  artImage?: CardRenderImageResource;
  foregroundImage?: CardRenderImageResource;
};

export type RenderCardPayload = {
  draft: CardRenderDraft;
  resources?: CardRenderResources;
};
