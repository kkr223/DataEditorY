import { applyScriptTemplate } from '$lib/domain/script/workspace';
import { appSettingsState } from '$lib/stores/appSettings.svelte';

export function buildTemplateContent(cardName: string, cardCode: number) {
  return applyScriptTemplate(appSettingsState.values.scriptTemplate, cardName, cardCode);
}
