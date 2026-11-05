import { applyScriptTemplate } from '#lib/domain/script/workspace.ts';
import { appSettingsState } from '#lib/stores/appSettings.svelte.ts';

export function buildTemplateContent(cardName: string, cardCode: number) {
  return applyScriptTemplate(appSettingsState.values.scriptTemplate, cardName, cardCode);
}
