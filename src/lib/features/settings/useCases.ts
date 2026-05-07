import { tauriBridge } from '$lib/infrastructure/tauri';
import { openInSystemEditor } from '$lib/infrastructure/tauri/commands';
import {
  clearCustomCoverImage,
  saveAppSettings,
  setCustomCoverImage,
} from '$lib/stores/appSettings.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import type { SettingsFormState } from '$lib/features/settings/controller';
import { getNormalizedSettingsTemperature, parsePackageIncludePatternsText, validateSettingsForm } from '$lib/features/settings/controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function pickCoverImageFlow(input: {
  t: Translate;
}) {
  const selected = await tauriBridge.open({
    multiple: false,
    filters: [{ name: 'JPEG', extensions: ['jpg', 'jpeg'] }],
  });
  if (!selected || typeof selected !== 'string') {
    return false;
  }

  try {
    await setCustomCoverImage(selected);
    showToast(input.t('settings.cover_saved'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to set cover image', error);
    void writeErrorLog({ source: 'settings.cover.pick', error });
    showToast(input.t('settings.cover_save_failed'), 'error');
    return false;
  }
}

export async function clearCoverImageFlow(input: {
  t: Translate;
}) {
  try {
    await clearCustomCoverImage();
    showToast(input.t('settings.cover_cleared'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to clear cover image', error);
    void writeErrorLog({ source: 'settings.cover.clear', error });
    showToast(input.t('settings.cover_save_failed'), 'error');
    return false;
  }
}

export async function saveSettingsFlow(input: {
  form: SettingsFormState;
  t: Translate;
}) {
  const validationError = validateSettingsForm(input.form);
  if (validationError === 'shortcut-conflict') {
    showToast(input.t('settings.shortcuts_conflict_toast'), 'error');
    return false;
  }

  try {
    await saveAppSettings({
      apiBaseUrl: input.form.apiBaseUrl,
      model: input.form.model,
      temperature: getNormalizedSettingsTemperature(input.form.temperature),
      scriptTemplate: input.form.scriptTemplate,
      useExternalScriptEditor: input.form.useExternalScriptEditor,
      saveScriptImageToLocal: input.form.saveScriptImageToLocal,
      packageIncludePatterns: parsePackageIncludePatternsText(input.form.packageIncludePatternsText),
      shortcutBindings: input.form.shortcutBindings,
      secretKey: input.form.secretKey,
    });
    input.form.secretKey = '';
    showToast(input.t('settings.save_success'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to save settings', error);
    void writeErrorLog({ source: 'settings.save', error });
    showToast(input.t('settings.save_failed'), 'error');
    return false;
  }
}

export async function openErrorLogFlow(input: {
  errorLogPath: string;
  t: Translate;
}) {
  if (!input.errorLogPath) {
    return false;
  }

  try {
    await openInSystemEditor(input.errorLogPath);
    return true;
  } catch (error) {
    console.error('Failed to open error log', error);
    void writeErrorLog({
      source: 'settings.error-log.open',
      error,
      extra: { path: input.errorLogPath },
    });
    showToast(input.t('settings.error_log_open_failed'), 'error');
    return false;
  }
}
