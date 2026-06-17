export type AppBuildVariant = "base" | "extra";

export const APP_BUILD_VARIANT = __APP_BUILD_VARIANT__ satisfies AppBuildVariant;
export const APP_BUILD_LABEL = __APP_BUILD_LABEL__;
export const APP_MODULE_IDS = __APP_MODULE_IDS__;

export const hasBuiltInModule = (moduleId: string) => APP_MODULE_IDS.includes(moduleId);
