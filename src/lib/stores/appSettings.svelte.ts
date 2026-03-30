import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';

export interface AppSettingsPayload {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  scriptTemplate: string;
  useExternalScriptEditor: boolean;
  hasSecretKey: boolean;
  coverImagePath: string | null;
  errorLogPath: string;
}

const DEFAULT_COVER_SRC = '/resources/cover.jpg';
const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';

function createDefaultSettings(): AppSettingsPayload {
  return {
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 1,
    scriptTemplate: '-- {卡名}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n',
    useExternalScriptEditor: false,
    hasSecretKey: false,
    coverImagePath: null,
    errorLogPath: '',
  };
}

function normalizeTemperature(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0, Number(value)));
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
    temperature: normalizeTemperature(payload.temperature),
    scriptTemplate: payload.scriptTemplate?.trim() ? payload.scriptTemplate : createDefaultSettings().scriptTemplate,
    useExternalScriptEditor: Boolean(payload.useExternalScriptEditor),
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

async function resolveSecretKey(providedSecretKey?: string) {
  const direct = providedSecretKey?.trim();
  if (direct) {
    return direct;
  }

  const stored = await invokeCommand<string | null>('load_secret_key');
  return stored?.trim() || '';
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

export async function saveAppSettings(input: {
  apiBaseUrl: string;
  model?: string;
  temperature?: number;
  scriptTemplate: string;
  useExternalScriptEditor?: boolean;
  secretKey?: string;
  clearSecretKey?: boolean;
}) {
  appSettingsState.saving = true;
  try {
    const payload = await invokeCommand<AppSettingsPayload>('save_app_settings', {
      request: {
        apiBaseUrl: input.apiBaseUrl,
        model: input.model,
        temperature: normalizeTemperature(input.temperature ?? appSettingsState.values.temperature),
        scriptTemplate: input.scriptTemplate,
        useExternalScriptEditor: input.useExternalScriptEditor,
        secretKey: input.secretKey,
        clearSecretKey: input.clearSecretKey,
      },
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

    if (apiBaseUrl.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(apiBaseUrl)) {
      console.warn('[DataEditorY] API base URL uses HTTP instead of HTTPS — the secret key will be transmitted in plaintext.');
    }

    const secretKey = await resolveSecretKey(input.secretKey);
    if (!secretKey) {
      throw new Error('Secret key is required');
    }

    const response = await fetch(getModelsEndpoint(apiBaseUrl), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Failed to load models (${response.status})`);
    }

    const models = Array.isArray(payload?.data)
      ? payload.data
          .map((item: unknown) => (item && typeof item === 'object' && 'id' in item ? String(item.id ?? '').trim() : ''))
          .filter((item: string) => item.length > 0)
      : [];

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
        temperature: normalizeTemperature(input.temperature ?? appSettingsState.values.temperature),
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
