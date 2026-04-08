import { describe, expect, test } from 'bun:test';
import {
  createSettingsFormState,
  getNormalizedSettingsTemperature,
  hydrateSettingsForm,
  isSettingsFormDirty,
  shouldAutoConnectSettings,
} from '$lib/features/settings/controller';

describe('settings controller helpers', () => {
  test('creates the default settings form state', () => {
    expect(createSettingsFormState()).toEqual({
      apiBaseUrl: '',
      model: 'gpt-4o-mini',
      temperature: 1,
      scriptTemplate: '',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      secretKey: '',
    });
  });

  test('normalizes temperature into the supported range', () => {
    expect(getNormalizedSettingsTemperature(Number.NaN)).toBe(1);
    expect(getNormalizedSettingsTemperature(-1)).toBe(0);
    expect(getNormalizedSettingsTemperature(3)).toBe(2);
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
        scriptTemplate: '-- template',
        useExternalScriptEditor: true,
        saveScriptImageToLocal: true,
        hasSecretKey: true,
        coverImagePath: null,
        errorLogPath: 'D:/logs/error.log',
      },
      { isHydrated: false },
    );

    expect(form.apiBaseUrl).toBe('https://api.openai.com/v1');
    expect(form.model).toBe('gpt-4.1-mini');
    expect(form.temperature).toBe(1.4);
    expect(form.scriptTemplate).toBe('-- template');
    expect(form.useExternalScriptEditor).toBe(true);
    expect(form.saveScriptImageToLocal).toBe(true);
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
        scriptTemplate: '-- updated',
        useExternalScriptEditor: false,
        saveScriptImageToLocal: false,
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
    form.scriptTemplate = '-- template';

    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
      hasSecretKey: false,
      coverImagePath: null,
      errorLogPath: '',
    })).toBe(false);

    form.secretKey = 'unsaved-secret';
    expect(isSettingsFormDirty(form, {
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 1,
      scriptTemplate: '-- template',
      useExternalScriptEditor: false,
      saveScriptImageToLocal: false,
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
