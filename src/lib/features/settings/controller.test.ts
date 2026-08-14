import { describe, expect, test } from 'bun:test';
import {
  createSettingsFormState,
  getNormalizedAgentMaxSteps,
  getNormalizedSettingsTemperature,
  hydrateSettingsForm,
  isSettingsFormDirty,
  shouldAutoConnectSettings,
} from '$lib/features/settings/controller';
import { createDefaultShortcutBindingMap } from '$lib/features/shortcuts/registry';

const DEFAULT_SHORTCUT_BINDINGS = createDefaultShortcutBindingMap();

describe('settings controller helpers', () => {
  test('creates the default settings form state', () => {
    const state = createSettingsFormState();
    expect(state.apiBaseUrl).toBe('');
    expect(state.model).toBe('gpt-4o-mini');
    expect(state.temperature).toBe(1);
    expect(state.agentMaxSteps).toBe(100);
    expect(state.ygoproPath).toBe('');
    expect(state.scriptDirectory).toBe('');
    expect(state.scriptTemplate).toBe('');
    expect(state.useExternalScriptEditor).toBe(false);
    expect(state.saveScriptImageToLocal).toBe(false);
    expect(state.autoCompleteFunctionParameters).toBe(true);
    expect(state.packageIncludePatternsText).toBe('');
    expect(state.secretKey).toBe('');
    expect(typeof state.shortcutBindings).toBe('object');
    expect(Object.keys(state.shortcutBindings).length > 0).toBe(true);
  });

  test('normalizes temperature into the supported range', () => {
    expect(getNormalizedSettingsTemperature(Number.NaN)).toBe(1);
    expect(getNormalizedSettingsTemperature(-1)).toBe(0);
    expect(getNormalizedSettingsTemperature(3)).toBe(2);
  });

  test('normalizes long-task rounds into the supported range', () => {
    expect(getNormalizedAgentMaxSteps(Number.NaN)).toBe(100);
    expect(getNormalizedAgentMaxSteps(0)).toBe(1);
    expect(getNormalizedAgentMaxSteps(42.6)).toBe(43);
    expect(getNormalizedAgentMaxSteps(500)).toBe(200);
  });

  test('hydrates the form from persisted settings and clears secret on first hydration', () => {
    const form = createSettingsFormState();
    form.secretKey = 'temporary-secret';

    const result = hydrateSettingsForm(
      form,
      {
        apiBaseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        temperature: 1.4,
        agentMaxSteps: 140,
        ygoproPath: 'D:/ygopro',
        scriptDirectory: 'D:/YGO/script',
        scriptTemplate: '-- template',
        useExternalScriptEditor: true,
        saveScriptImageToLocal: true,
        autoCompleteFunctionParameters: false,
        packageIncludePatterns: ['pics/{code}.jpg', 'script/c{code}.lua'],
        shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
        hasSecretKey: true,
        coverImagePath: null,
        errorLogPath: 'D:/logs/error.log',
      },
      { isHydrated: false },
    );

    expect(form.apiBaseUrl).toBe('https://api.openai.com/v1');
    expect(form.model).toBe('gpt-4.1-mini');
    expect(form.temperature).toBe(1.4);
    expect(form.agentMaxSteps).toBe(140);
    expect(form.ygoproPath).toBe('D:/ygopro');
    expect(form.scriptDirectory).toBe('D:/YGO/script');
    expect(form.scriptTemplate).toBe('-- template');
    expect(form.useExternalScriptEditor).toBe(true);
    expect(form.saveScriptImageToLocal).toBe(true);
    expect(form.autoCompleteFunctionParameters).toBe(false);
    expect(form.packageIncludePatternsText).toBe('pics/{code}.jpg\nscript/c{code}.lua');
    expect(form.secretKey).toBe('');
    expect(result.isHydrated).toBe(true);
  });

  test('keeps the current secret field after the first hydration', () => {
    const form = createSettingsFormState();
    form.secretKey = 'draft-secret';

    hydrateSettingsForm(
      form,
      {
        apiBaseUrl: 'https://api.example.com/v1',
        model: 'custom-model',
        temperature: 0.5,
        agentMaxSteps: 100,
        ygoproPath: '',
        scriptDirectory: '',
        scriptTemplate: '-- updated',
        useExternalScriptEditor: false,
        saveScriptImageToLocal: false,
        autoCompleteFunctionParameters: true,
        packageIncludePatterns: ['pics/{code}.jpg'],
        shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
        hasSecretKey: true,
        coverImagePath: null,
        errorLogPath: '',
      },
      { isHydrated: true },
    );

    expect(form.secretKey).toBe('draft-secret');
  });

  test('detects unsaved settings form changes from persisted values', () => {
    const form = createSettingsFormState();
    form.apiBaseUrl = 'https://api.openai.com/v1';
    form.model = 'gpt-4o-mini';
    form.temperature = 1;
    form.scriptDirectory = '';
    form.scriptTemplate = '-- template';
    form.packageIncludePatternsText = 'pics/{code}.jpg';

    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(false);

    form.autoCompleteFunctionParameters = false;
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(true);
    form.autoCompleteFunctionParameters = true;

    form.agentMaxSteps = 150;
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(true);
    form.agentMaxSteps = 100;

    form.packageIncludePatternsText = 'pics/{code}.jpg\nscript/c{code}.lua';
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(true);

    form.packageIncludePatternsText = 'pics/{code}.jpg';
    form.scriptDirectory = 'D:/YGO/script';
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(true);

    form.scriptDirectory = '';
    form.secretKey = 'unsaved-secret';
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      agentMaxSteps: 100,
      ygoproPath: '',
      scriptDirectory: '',
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      autoCompleteFunctionParameters: true,
      packageIncludePatterns: ['pics/{code}.jpg'],
      shortcutBindings: DEFAULT_SHORTCUT_BINDINGS,
      hasSecretKey: true,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(true);
  });

  test('only auto-connects when the lifecycle guards are satisfied', () => {
    expect(
      shouldAutoConnectSettings({
        hasAiCapability: true,
        triedAutoConnect: false,
        loading: false,
        loaded: true,
        hasSecretKey: true,
        apiBaseUrl: 'https://api.openai.com/v1',
      }),
    ).toBe(true);

    expect(
      shouldAutoConnectSettings({
        hasAiCapability: true,
        triedAutoConnect: true,
        loading: false,
        loaded: true,
        hasSecretKey: true,
        apiBaseUrl: 'https://api.openai.com/v1',
      }),
    ).toBe(false);

    expect(
      shouldAutoConnectSettings({
        hasAiCapability: false,
        triedAutoConnect: false,
        loading: false,
        loaded: true,
        hasSecretKey: true,
        apiBaseUrl: 'https://api.openai.com/v1',
      }),
    ).toBe(false);
  });
});
