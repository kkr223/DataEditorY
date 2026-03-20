export type AppBuildVariant = "base" | "extra";

export type AppFeatureFlags = {
  cardImage: boolean;
  ai: boolean;
};

export const APP_BUILD_VARIANT = __APP_BUILD_VARIANT__ satisfies AppBuildVariant;
export const APP_BUILD_LABEL = __APP_BUILD_LABEL__;
export const APP_FEATURES = __APP_FEATURES__ satisfies AppFeatureFlags;

export const HAS_CARD_IMAGE_FEATURE = APP_FEATURES.cardImage;
export const HAS_AI_FEATURE = APP_FEATURES.ai;
