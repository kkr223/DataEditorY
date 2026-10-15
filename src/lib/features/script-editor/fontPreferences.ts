export const DEFAULT_SCRIPT_EDITOR_FONT_SIZE = 14;
export const SCRIPT_EDITOR_FONT_SIZE_MIN = 8;
export const SCRIPT_EDITOR_FONT_SIZE_MAX = 32;

export function normalizeScriptEditorFontSize(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return DEFAULT_SCRIPT_EDITOR_FONT_SIZE;
  return Math.min(SCRIPT_EDITOR_FONT_SIZE_MAX, Math.max(SCRIPT_EDITOR_FONT_SIZE_MIN, Math.round(value)));
}
