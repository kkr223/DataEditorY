import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';
import { listAiModels } from '$lib/infrastructure/tauri/commands';
import { normalizeShortcutBindingMap } from '$lib/features/shortcuts/registry';
import {
  buildSaveAppSettingsRequest,
  DEFAULT_PACKAGE_INCLUDE_PATTERNS,
  normalizePackageIncludePatterns,
  normalizeSettingsTemperature,
  type SaveAppSettingsInput,
} from '$lib/stores/appSettingsRequest';
import type { AppSettingsPayload } from '$lib/types/app';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';

export type { AppSettingsPayload } from '$lib/types/app';
export { DEFAULT_PACKAGE_INCLUDE_PATTERNS } from '$lib/stores/appSettingsRequest';

const DEFAULT_COVER_SRC = '/resources/cover.jpg';
const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_SCRIPT_TEMPLATE = '-- {name}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n';
const LEGACY_DEFAULT_SCRIPT_TEMPLATE = '-- {卡名}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n';

function createDefaultSettings(): AppSettingsPayload {
  return {
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 1,
    scriptTemplate: DEFAULT_SCRIPT_TEMPLATE,
    useExternalScriptEditor: false,
    saveScriptImageToLocal: false,
    packageIncludePatterns: [...DEFAULT_PACKAGE_INCLUDE_PATTERNS],
    shortcutBindings: normalizeShortcutBindingMap(undefined),
    hasSecretKey: false,
    coverImagePath: null,
    errorLogPath: '',
  };
}

function normalizeScriptTemplate(value: string | null | undefined) {
  const template = value ?? '';
  if (!template.trim() || template === LEGACY_DEFAULT_SCRIPT_TEMPLATE) {
    return DEFAULT_SCRIPT_TEMPLATE;
  }
  return template;
}

function resolveCoverSrc(path: string | null, revision: number): string {
  if (!path || !tauriBridge.isTauri()) {
    return DEFAULT_COVER_SRC;
  }

  return toMediaProtocolSrc(path, revision);
}

export const appSettingsState = $state({
  loaded: false,
  loading: false,
  saving: false,
  connecting: false,
  coverRevision: 0,
  coverImageSrc: DEFAULT_COVER_SRC,
  modelOptions: [] as string[],
  modelsLoaded: false,
  connectionError: '',
  values: createDefaultSettings(),
});

function applySettings(payload: AppSettingsPayload) {
  appSettingsState.values = {
    apiBaseUrl: payload.apiBaseUrl ?? '',
    model: payload.model?.trim() || 'gpt-4o-mini',
    temperature: normalizeSettingsTemperature(payload.temperature),
    scriptTemplate: normalizeScriptTemplate(payload.scriptTemplate),
    useExternalScriptEditor: Boolean(payload.useExternalScriptEditor),
    saveScriptImageToLocal: Boolean(payload.saveScriptImageToLocal),
    packageIncludePatterns: normalizePackageIncludePatterns(payload.packageIncludePatterns),
    shortcutBindings: normalizeShortcutBindingMap(payload.shortcutBindings),
    hasSecretKey: Boolean(payload.hasSecretKey),
    coverImagePath: payload.coverImagePath ?? null,
    errorLogPath: payload.errorLogPath ?? '',
  };
  if (appSettingsState.values.model) {
    appSettingsState.modelOptions = Array.from(new Set([
      ...appSettingsState.modelOptions,
      appSettingsState.values.model,
    ]));
    appSettingsState.modelsLoaded = appSettingsState.modelOptions.length > 0;
  }
  appSettingsState.coverRevision = Date.now();
  appSettingsState.coverImageSrc = resolveCoverSrc(appSettingsState.values.coverImagePath, appSettingsState.coverRevision);
  appSettingsState.loaded = true;
}

function getModelsEndpoint(apiBaseUrl: string) {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
  if (normalized.endsWith('/models')) {
    return normalized;
  }
  return `${normalized}/models`;
}

function isUnsafeHttpApiBaseUrl(apiBaseUrl: string) {
  return apiBaseUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]|::1)(:|\/|$)/.test(apiBaseUrl);
}

export async function loadAppSettings(force = false) {
  if (appSettingsState.loading) return appSettingsState.values;
  if (appSettingsState.loaded && !force) return appSettingsState.values;

  appSettingsState.loading = true;
  try {
    const payload = await invokeCommand<AppSettingsPayload>('load_app_settings');
    applySettings(payload);
    return appSettingsState.values;
  } finally {
    appSettingsState.loading = false;
  }
}

export async function saveAppSettings(input: SaveAppSettingsInput) {
  appSettingsState.saving = true;
  try {
    const request = buildSaveAppSettingsRequest(input, appSettingsState.values.temperature);
    const payload = await invokeCommand<AppSettingsPayload>('save_app_settings', {
      request,
    });
    applySettings(payload);
    return appSettingsState.values;
  } finally {
    appSettingsState.saving = false;
  }
}

export async function setCustomCoverImage(sourcePath: string) {
  const coverImagePath = await invokeCommand<string>('set_cover_image', { sourcePath });
  applySettings({
    ...appSettingsState.values,
    coverImagePath,
  });
}

export async function clearCustomCoverImage() {
  await invokeCommand('clear_cover_image');
  applySettings({
    ...appSettingsState.values,
    coverImagePath: null,
  });
}

export function hasConfiguredSecretKey() {
  return appSettingsState.values.hasSecretKey;
}

export async function connectAiProvider(input: {
  apiBaseUrl: string;
  secretKey?: string;
  temperature?: number;
  scriptTemplate: string;
  preferredModel?: string;
  persist?: boolean;
}) {
  appSettingsState.connecting = true;
  appSettingsState.connectionError = '';

  try {
    const apiBaseUrl = input.apiBaseUrl.trim() || DEFAULT_API_BASE_URL;

    if (isUnsafeHttpApiBaseUrl(apiBaseUrl)) {
      throw new Error('Insecure HTTP API base URL is not allowed for secret key authentication. Use HTTPS or localhost.');
    }

    const models = await listAiModels({
      apiBaseUrl: getModelsEndpoint(apiBaseUrl),
      secretKey: input.secretKey?.trim() || undefined,
    });

    if (models.length === 0) {
      throw new Error('No models were returned by the API');
    }

    const selectedModel = models.includes(input.preferredModel ?? '')
      ? (input.preferredModel as string)
      : models[0];

    appSettingsState.modelOptions = models;
    appSettingsState.modelsLoaded = true;

    if (input.persist === false) {
      appSettingsState.values = {
        ...appSettingsState.values,
        apiBaseUrl,
        model: selectedModel,
        temperature: normalizeSettingsTemperature(input.temperature ?? appSettingsState.values.temperature),
      };
      return { models, selectedModel };
    }

    await saveAppSettings({
      apiBaseUrl,
      model: selectedModel,
      temperature: input.temperature ?? appSettingsState.values.temperature,
      scriptTemplate: input.scriptTemplate,
      secretKey: input.secretKey,
    });
    appSettingsState.modelOptions = models;
    appSettingsState.modelsLoaded = true;
    return { models, selectedModel };
  } catch (error) {
    appSettingsState.connectionError = error instanceof Error ? error.message : 'Failed to load models';
    if (appSettingsState.values.model) {
      appSettingsState.modelOptions = Array.from(new Set([
        ...appSettingsState.modelOptions,
        appSettingsState.values.model,
      ]));
      appSettingsState.modelsLoaded = appSettingsState.modelOptions.length > 0;
    }
    throw error;
  } finally {
    appSettingsState.connecting = false;
  }
}
