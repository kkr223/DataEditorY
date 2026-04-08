import type { AppSettingsPayload } from '$lib/stores/appSettings.svelte';

export type SettingsFormState = {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  scriptTemplate: string;
  useExternalScriptEditor: boolean;
  saveScriptImageToLocal: boolean;
  secretKey: string;
};

export function createSettingsFormState(): SettingsFormState {
  return {
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 1,
    scriptTemplate: '',
    useExternalScriptEditor: false,
    saveScriptImageToLocal: false,
    secretKey: '',
  };
}

export function getNormalizedSettingsTemperature(temperature: number) {
  const value = Number(temperature);
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0, value));
}

export function hydrateSettingsForm(
  form: SettingsFormState,
  values: AppSettingsPayload,
  input: {
    isHydrated: boolean;
  },
) {
  form.apiBaseUrl = values.apiBaseUrl;
  form.model = values.model;
  form.temperature = values.temperature;
  form.scriptTemplate = values.scriptTemplate;
  form.useExternalScriptEditor = values.useExternalScriptEditor;
  form.saveScriptImageToLocal = values.saveScriptImageToLocal;

  if (!input.isHydrated) {
    form.secretKey = '';
  }

  return {
    isHydrated: true,
  };
}

export function isSettingsFormDirty(
  form: SettingsFormState,
  values: AppSettingsPayload,
) {
  return form.apiBaseUrl !== values.apiBaseUrl
    || form.model !== values.model
    || getNormalizedSettingsTemperature(form.temperature) !== getNormalizedSettingsTemperature(values.temperature)
    || form.scriptTemplate !== values.scriptTemplate
    || form.useExternalScriptEditor !== values.useExternalScriptEditor
    || form.saveScriptImageToLocal !== values.saveScriptImageToLocal
    || form.secretKey.trim().length > 0;
}

export function shouldAutoConnectSettings(input: {
  hasAiCapability: boolean;
  triedAutoConnect: boolean;
  loading: boolean;
  loaded: boolean;
  hasSecretKey: boolean;
  apiBaseUrl: string;
}) {
  return (
    input.hasAiCapability
    && !input.triedAutoConnect
    && !input.loading
    && input.loaded
    && input.hasSecretKey
    && input.apiBaseUrl.trim().length > 0
  );
}
