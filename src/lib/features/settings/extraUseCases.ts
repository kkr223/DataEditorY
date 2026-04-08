import {
  appSettingsState,
  connectAiProvider,
  saveAppSettings,
  type AppSettingsPayload,
} from '$lib/stores/appSettings.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { writeErrorLog } from '$lib/utils/errorLog';
import { getNormalizedSettingsTemperature, type SettingsFormState } from '$lib/features/settings/controller';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function connectSettingsAiFlow(input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  if (!input.hasAiCapability) {
    return false;
  }

  try {
    const result = await connectAiProvider({
      apiBaseUrl: input.form.apiBaseUrl,
      secretKey: input.form.secretKey,
      temperature: getNormalizedSettingsTemperature(input.form.temperature),
      scriptTemplate: input.form.scriptTemplate,
      preferredModel: input.form.model,
    });
    input.form.model = result.selectedModel;
    input.form.secretKey = '';
    showToast(input.t('settings.connect_success'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to connect AI provider', error);
    void writeErrorLog({
      source: 'settings.ai.connect',
      error,
      extra: { apiBaseUrl: input.form.apiBaseUrl },
    });
    showToast(input.t('settings.connect_failed'), 'error');
    return false;
  }
}

export async function saveSelectedModelFlow(input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  if (!input.hasAiCapability) {
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
    });
    showToast(input.t('settings.model_saved'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to save selected model', error);
    void writeErrorLog({
      source: 'settings.ai.model.change',
      error,
      extra: { apiBaseUrl: input.form.apiBaseUrl, model: input.form.model },
    });
    showToast(input.t('settings.save_failed'), 'error');
    return false;
  }
}

export async function clearSecretKeyFlow(input: {
  form: SettingsFormState;
  hasAiCapability: boolean;
  t: Translate;
}) {
  if (!input.hasAiCapability) {
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
      clearSecretKey: true,
    });
    input.form.secretKey = '';
    showToast(input.t('settings.secret_cleared'), 'success');
    return true;
  } catch (error) {
    console.error('Failed to clear secret key', error);
    void writeErrorLog({ source: 'settings.secret.clear', error });
    showToast(input.t('settings.save_failed'), 'error');
    return false;
  }
}

export async function autoConnectSettingsFlow(input: {
  values: AppSettingsPayload;
  hasAiCapability: boolean;
  setModel: (model: string) => void;
}) {
  if (!input.hasAiCapability) {
    return false;
  }

  try {
    const result = await connectAiProvider({
      apiBaseUrl: input.values.apiBaseUrl,
      scriptTemplate: input.values.scriptTemplate,
      preferredModel: input.values.model,
      persist: false,
    });
    input.setModel(result.selectedModel);
    return true;
  } catch {
    return false;
  }
}

export function getSettingsConnectionHint(t: Translate) {
  if (appSettingsState.connectionError) {
    return `${t('settings.connect_error')}: ${appSettingsState.connectionError}`;
  }

  if (appSettingsState.modelOptions.length > 0) {
    return t('settings.connect_ready', {
      values: { count: String(appSettingsState.modelOptions.length) },
    });
  }

  return t('settings.connect_hint');
}
