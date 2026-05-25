import { describe, expect, test } from 'bun:test';
import {
  buildSaveAppSettingsRequest,
  DEFAULT_PACKAGE_INCLUDE_PATTERNS,
  normalizePackageIncludePatterns,
  normalizeSettingsTemperature,
} from '$lib/stores/appSettingsRequest';

describe('app settings request helpers', () => {
  test('normalizes frontend settings before saving', () => {
    const request = buildSaveAppSettingsRequest(
      {
        apiBaseUrl: 'https://api.example.com/v1/',
        model: 'custom-model',
        temperature: 3,
        scriptTemplate: '-- template',
        useExternalScriptEditor: true,
        saveScriptImageToLocal: false,
        packageIncludePatterns: [
          ' pics\\{code}.jpg ',
          '',
          'script\\c{code}.lua',
          'script\\c{code}.lua',
        ],
        shortcutBindings: {
          'global.openDatabase': ' ctrl+o ',
        },
        secretKey: '  sk-test  ',
      },
      1,
    );

    expect(request.temperature).toBe(2);
    expect(request.packageIncludePatterns).toEqual(['pics/{code}.jpg', 'script/c{code}.lua']);
    expect(request.shortcutBindings?.['global.openDatabase']).toBe('Primary+O');
    expect(request.secretKey).toBe('  sk-test  ');
    expect(request.clearSecretKey).toBeNull();
  });

  test('uses fallback temperature and explicit clear-secret flag', () => {
    const request = buildSaveAppSettingsRequest(
      {
        apiBaseUrl: 'https://api.example.com/v1',
        scriptTemplate: '-- template',
        clearSecretKey: true,
      },
      Number.NaN,
    );

    expect(request.model).toBeNull();
    expect(request.temperature).toBe(1);
    expect(request.packageIncludePatterns).toBeNull();
    expect(request.shortcutBindings).toBeNull();
    expect(request.secretKey).toBeNull();
    expect(request.clearSecretKey).toBe(true);
  });

  test('maps empty and legacy package patterns to the current defaults', () => {
    expect(normalizePackageIncludePatterns([])).toEqual(DEFAULT_PACKAGE_INCLUDE_PATTERNS);
    expect(normalizePackageIncludePatterns([
      'pics/{code}.jpg',
      'pics/field/{code}.jpg',
      'script/{code}.lua',
      'strings.conf',
      'lflist.conf',
    ])).toEqual(DEFAULT_PACKAGE_INCLUDE_PATTERNS);
  });

  test('clamps settings temperature into the supported range', () => {
    expect(normalizeSettingsTemperature(-1)).toBe(0);
    expect(normalizeSettingsTemperature(1.25)).toBe(1.25);
    expect(normalizeSettingsTemperature(5)).toBe(2);
    expect(normalizeSettingsTemperature(Number.NaN)).toBe(1);
  });
});
