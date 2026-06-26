import { invokeCommand, tauriBridge } from '$lib/infrastructure/tauri';
import { normalizeShortcutBindingMap } from '$lib/features/shortcuts/registry';
import { toMediaProtocolSrc } from '$lib/utils/mediaProtocol';

export interface AppSettingsPayload {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  scriptDirectory: string;
  scriptTemplate: string;
  useExternalScriptEditor: boolean;
  saveScriptImageToLocal: boolean;
  packageIncludePatterns: string[];
  shortcutBindings: Record<string, string>;
  hasSecretKey: boolean;
  coverImagePath: string | null;
  errorLogPath: string;
}

const DEFAULT_COVER_SRC = '/resources/cover.jpg';
const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_SCRIPT_TEMPLATE = '-- {name}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n';
const LEGACY_DEFAULT_SCRIPT_TEMPLATE = '-- {卡名}\nlocal s,id,o=GetID()\nfunction s.initial_effect(c)\n\nend\n';
const MODEL_CACHE_KEY = 'dataeditory:ai-model-cache:v1';
export const DEFAULT_PACKAGE_INCLUDE_PATTERNS = [
  'pics/{code}.jpg',
  'pics/field/{code}.jpg',
  'script/c{code}.lua',
  'strings.conf',
  'lflist.conf',
];
const LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS = [
  'pics/{code}.jpg',
  'pics/field/{code}.jpg',
  'script/{code}.lua',
  'strings.conf',
  'lflist.conf',
];

type CachedModelList = {
  models: string[];
  contextLimits: Record<string, number>;
  outputLimits: Record<string, number>;
  cachedAt: number;
};

type ModelCacheMap = Record<string, CachedModelList>;

function isSamePatternList(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function createDefaultSettings(): AppSettingsPayload {
  return {
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 1,
    scriptDirectory: '',
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

function normalizeTemperature(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(2, Math.max(0, Number(value)));
}

function normalizePackageIncludePatterns(value: string[] | null | undefined) {
  const patterns = (value ?? [])
    .map((item) => String(item ?? '').trim().replace(/\\/g, '/'))
    .filter((item) => item.length > 0);
  const uniquePatterns = Array.from(new Set(patterns));
  if (uniquePatterns.length === 0 || isSamePatternList(uniquePatterns, LEGACY_DEFAULT_PACKAGE_INCLUDE_PATTERNS)) {
    return [...DEFAULT_PACKAGE_INCLUDE_PATTERNS];
  }
  return uniquePatterns;
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
  modelContextLimits: {} as Record<string, number>,
  modelOutputLimits: {} as Record<string, number>,
  modelsLoaded: false,
  connectionError: '',
  values: createDefaultSettings(),
});

function getModelCacheKey(apiBaseUrl: string) {
  return (apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL).toLowerCase();
}

function readModelCacheMap(): ModelCacheMap {
  try {
    const raw = globalThis.localStorage?.getItem(MODEL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as ModelCacheMap : {};
  } catch {
    return {};
  }
}

function readCachedModelList(apiBaseUrl: string) {
  const cached = readModelCacheMap()[getModelCacheKey(apiBaseUrl)];
  if (!cached || !Array.isArray(cached.models) || cached.models.length === 0) return null;
  return {
    models: cached.models.filter((model) => typeof model === 'string' && model.trim().length > 0),
    contextLimits: cached.contextLimits && typeof cached.contextLimits === 'object' ? cached.contextLimits : {},
    outputLimits: cached.outputLimits && typeof cached.outputLimits === 'object' ? cached.outputLimits : {},
  };
}

function writeCachedModelList(apiBaseUrl: string, cached: Omit<CachedModelList, 'cachedAt'>) {
  try {
    const cache = readModelCacheMap();
    cache[getModelCacheKey(apiBaseUrl)] = {
      ...cached,
      cachedAt: Date.now(),
    };
    globalThis.localStorage?.setItem(MODEL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache failures should not block settings or model loading.
  }
}

function applySettings(payload: AppSettingsPayload) {
  appSettingsState.values = {
    apiBaseUrl: payload.apiBaseUrl ?? '',
    model: payload.model?.trim() || 'gpt-4o-mini',
    temperature: normalizeTemperature(payload.temperature),
    scriptDirectory: payload.scriptDirectory?.trim() ?? '',
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
    const cached = readCachedModelList(appSettingsState.values.apiBaseUrl);
    if (cached) {
      appSettingsState.modelOptions = Array.from(new Set([
        ...cached.models,
        appSettingsState.values.model,
      ]));
      appSettingsState.modelContextLimits = cached.contextLimits;
      appSettingsState.modelOutputLimits = cached.outputLimits;
      appSettingsState.modelsLoaded = appSettingsState.modelOptions.length > 0;
    }
  }
  if (appSettingsState.values.model && appSettingsState.modelOptions.length === 0) {
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

function readModelContextLimit(item: unknown) {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const topProvider = record.top_provider && typeof record.top_provider === 'object'
    ? record.top_provider as Record<string, unknown>
    : {};
  const raw = record.context_length ?? record.contextLength ?? topProvider.context_length;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function readModelOutputLimit(item: unknown) {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const topProvider = record.top_provider && typeof record.top_provider === 'object'
    ? record.top_provider as Record<string, unknown>
    : {};
  const raw = record.max_completion_tokens
    ?? record.maxCompletionTokens
    ?? record.max_output_tokens
    ?? record.maxOutputTokens
    ?? topProvider.max_completion_tokens
    ?? topProvider.maxCompletionTokens;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
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
  scriptDirectory?: string;
  scriptTemplate: string;
  useExternalScriptEditor?: boolean;
  saveScriptImageToLocal?: boolean;
  packageIncludePatterns?: string[];
  shortcutBindings?: Record<string, string>;
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
        scriptDirectory: input.scriptDirectory ?? appSettingsState.values.scriptDirectory,
        scriptTemplate: input.scriptTemplate,
        useExternalScriptEditor: input.useExternalScriptEditor,
        saveScriptImageToLocal: input.saveScriptImageToLocal,
        packageIncludePatterns: input.packageIncludePatterns
          ? normalizePackageIncludePatterns(input.packageIncludePatterns)
          : undefined,
        shortcutBindings: input.shortcutBindings
          ? normalizeShortcutBindingMap(input.shortcutBindings)
          : undefined,
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

    const modelContextLimits: Record<string, number> = {};
    const modelOutputLimits: Record<string, number> = {};
    const models = Array.isArray(payload?.data)
      ? payload.data
          .map((item: unknown) => {
            const id = item && typeof item === 'object' && 'id' in item ? String(item.id ?? '').trim() : '';
            const limit = readModelContextLimit(item);
            const outputLimit = readModelOutputLimit(item);
            if (id && limit) modelContextLimits[id] = limit;
            if (id && outputLimit) modelOutputLimits[id] = outputLimit;
            return id;
          })
          .filter((item: string) => item.length > 0)
      : [];

    if (models.length === 0) {
      throw new Error('No models were returned by the API');
    }

    const selectedModel = models.includes(input.preferredModel ?? '')
      ? (input.preferredModel as string)
      : models[0];

    appSettingsState.modelOptions = models;
    appSettingsState.modelContextLimits = modelContextLimits;
    appSettingsState.modelOutputLimits = modelOutputLimits;
    appSettingsState.modelsLoaded = true;
    writeCachedModelList(apiBaseUrl, {
      models,
      contextLimits: modelContextLimits,
      outputLimits: modelOutputLimits,
    });

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
    appSettingsState.modelContextLimits = modelContextLimits;
    appSettingsState.modelOutputLimits = modelOutputLimits;
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
