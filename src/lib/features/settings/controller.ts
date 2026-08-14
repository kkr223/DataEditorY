import type { AppSettingsPayload } from '$lib/stores/appSettings.svelte';
import { DEFAULT_AGENT_MAX_STEPS, normalizeAgentMaxSteps } from '$lib/features/ai/agentLimits';
import { hasShortcutConflicts, normalizeShortcutBindingMap } from '$lib/features/shortcuts/registry';

export type SettingsFormState = {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  agentMaxSteps: number;
  ygoproPath: string;
  scriptDirectory: string;
  scriptTemplate: string;
  useExternalScriptEditor: boolean;
  saveScriptImageToLocal: boolean;
  autoCompleteFunctionParameters: boolean;
  packageIncludePatternsText: string;
  shortcutBindings: Record<string, string>;
  secretKey: string;
};

export function createSettingsFormState(): SettingsFormState {
  return {
    apiBaseUrl: '',
    model: 'gpt-4o-mini',
    temperature: 1,
    agentMaxSteps: DEFAULT_AGENT_MAX_STEPS,
    ygoproPath: '',
    scriptDirectory: '',
    scriptTemplate: '',
    useExternalScriptEditor: false,
    saveScriptImageToLocal: false,
    autoCompleteFunctionParameters: true,
    packageIncludePatternsText: '',
    shortcutBindings: normalizeShortcutBindingMap(undefined),
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

export { normalizeAgentMaxSteps as getNormalizedAgentMaxSteps };

export function parsePackageIncludePatternsText(value: string) {
  const patterns = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return Array.from(new Set(patterns));
}

export function formatPackageIncludePatternsText(patterns: string[]) {
  return patterns.join('\n');
}

function formatShortcutBindings(bindings: Partial<Record<string, string>>) {
  return JSON.stringify(normalizeShortcutBindingMap(bindings));
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
  form.agentMaxSteps = normalizeAgentMaxSteps(values.agentMaxSteps);
  form.ygoproPath = values.ygoproPath;
  form.scriptDirectory = values.scriptDirectory;
  form.scriptTemplate = values.scriptTemplate;
  form.useExternalScriptEditor = values.useExternalScriptEditor;
  form.saveScriptImageToLocal = values.saveScriptImageToLocal;
  form.autoCompleteFunctionParameters = values.autoCompleteFunctionParameters;
  form.packageIncludePatternsText = formatPackageIncludePatternsText(values.packageIncludePatterns);
  form.shortcutBindings = normalizeShortcutBindingMap(values.shortcutBindings);

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
    || normalizeAgentMaxSteps(form.agentMaxSteps) !== normalizeAgentMaxSteps(values.agentMaxSteps)
    || form.ygoproPath.trim() !== values.ygoproPath.trim()
    || form.scriptDirectory.trim() !== values.scriptDirectory.trim()
    || form.scriptTemplate !== values.scriptTemplate
    || form.useExternalScriptEditor !== values.useExternalScriptEditor
    || form.saveScriptImageToLocal !== values.saveScriptImageToLocal
    || form.autoCompleteFunctionParameters !== values.autoCompleteFunctionParameters
    || formatPackageIncludePatternsText(parsePackageIncludePatternsText(form.packageIncludePatternsText)) !== formatPackageIncludePatternsText(values.packageIncludePatterns)
    || formatShortcutBindings(form.shortcutBindings) !== formatShortcutBindings(values.shortcutBindings)
    || form.secretKey.trim().length > 0;
}

export function validateSettingsForm(form: SettingsFormState) {
  if (hasShortcutConflicts(form.shortcutBindings)) {
    return 'shortcut-conflict' as const;
  }

  return null;
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
