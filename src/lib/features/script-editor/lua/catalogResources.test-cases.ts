import * as bunTest from 'bun:test';
import { readFileSync } from 'node:fs';
import { luaCatalog as bundledCatalog } from '$lib/data/lua-intel/catalog.generated';

const { expect, test } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const originalFunctions = readFileSync(new URL('../../../../../static/resources/_functions.txt', import.meta.url), 'utf8');
const originalDefinitions = readFileSync(new URL('../../../../../static/resources/def.lua', import.meta.url), 'utf8');
let resources = new Map<string, string>();
let resolvedPaths: string[] = [];
let desktop = true;

mock.module('$lib/infrastructure/tauri', () => ({
  tauriBridge: {
    isTauri: () => desktop,
    resolveResource: async (path: string) => path.replace(/^resources\//, ''),
  },
}));
mock.module('$lib/native/assetApi', () => ({
  resolveResourceFile: async (path: string) => {
    resolvedPaths.push(path);
    if (!resources.has(path)) throw new Error(`Missing resource: ${path}`);
    return path;
  },
  readTextFile: async (path: string) => {
    if (!resources.has(path)) throw new Error(`Missing resource: ${path}`);
    return resources.get(path)!;
  },
}));
const { loadExternalLuaCatalog } = await import('./catalog');

test('runtime function signatures and documentation override same-name typed definitions', async () => {
  resources = new Map([
    ['lua-intel/_functions.txt', '●string Duel.Destroy(Card target, int custom_reason)\nCustom installed documentation.'],
    ['lua-intel/constant.lua', 'CUSTOM_CONSTANT=42'],
    ['lua-intel/def.lua', originalDefinitions],
  ]);
  const catalog = await loadExternalLuaCatalog();
  const item = catalog?.functions.find((entry) => entry.name === 'Duel.Destroy');
  expect(item?.signature).toBe('Duel.Destroy(Card target, int custom_reason)');
  expect(item?.description).toBe('Custom installed documentation.');
  expect(item?.returnType).toBe('string');
  expect(item?.parameters).toEqual(['Card target', 'int custom_reason']);
  expect(catalog?.functions.filter((entry) => entry.name === 'Duel.Destroy')).toHaveLength(1);

  const { loadReferenceManualItems } = await import('./reference');
  const manual = (await loadReferenceManualItems('functions')).find((entry) => entry.title === 'Duel.Destroy');
  expect(manual?.description).toBe(item?.description);
  expect(manual?.detail).toBe('string Duel.Destroy(Card target, int custom_reason)');
  expect(manual?.insertText).toBe('Duel.Destroy(${1:target}, ${2:custom_reason})');
});

test('unchanged bundled function resources retain richer typed signatures', async () => {
  resources = new Map([
    ['lua-intel/_functions.txt', originalFunctions.replace(/\r?\n/g, '\r\n')],
    ['lua-intel/constant.lua', 'CUSTOM_CONSTANT=42'],
    ['lua-intel/def.lua', originalDefinitions],
  ]);
  const catalog = await loadExternalLuaCatalog();
  const actual = new Map(catalog?.functions.map((item) => [item.name, item]));
  expect(actual.size).toBe(bundledCatalog.functions.length);
  const differences = bundledCatalog.functions.filter((item) => {
    const runtime = actual.get(item.name);
    return !runtime || Object.keys(item).some((key) => (
      JSON.stringify(runtime[key as keyof typeof runtime]) !== JSON.stringify(item[key as keyof typeof item])
    ));
  });
  expect(differences.map((item) => item.name)).toEqual([]);
});

test('documentation-only changes retain the typed parameters', async () => {
  const modified = originalFunctions.replace(
    /(●int Duel\.Destroy[^\r\n]*\r?\n)[\s\S]*?(?=\r?\n●)/,
    '$1Custom description only.\n',
  );
  expect(modified === originalFunctions).toBe(false);
  resources = new Map([
    ['lua-intel/_functions.txt', modified],
    ['lua-intel/constant.lua', 'CUSTOM_CONSTANT=42'],
    ['lua-intel/def.lua', originalDefinitions],
  ]);
  const catalog = await loadExternalLuaCatalog();
  const item = catalog?.functions.find((entry) => entry.name === 'Duel.Destroy');
  const bundled = bundledCatalog.functions.find((entry) => entry.name === 'Duel.Destroy');
  expect(item?.description).toBe('Custom description only.');
  expect(item?.parameters).toEqual(bundled?.parameters);
  expect(item?.signature).toBe(bundled?.signature);
});

test('a missing companion resource does not discard a customized function file', async () => {
  resources = new Map([
    ['lua-intel/_functions.txt', [
      '●void Duel.CustomInstalledFunction(int player)',
      'Custom function.',
      '●string Duel.Destroy(Card target)',
      'Custom destroy without companion files.',
    ].join('\n')],
  ]);
  const catalog = await loadExternalLuaCatalog();
  expect(catalog?.functions.find((entry) => entry.name === 'Duel.CustomInstalledFunction')?.description).toBe('Custom function.');
  expect(catalog?.constants).toEqual(bundledCatalog.constants);
  expect(catalog?.functions.find((entry) => entry.name === 'Duel.Destroy')?.signature).toBe('Duel.Destroy(Card target)');
  expect(catalog?.functions.some((entry) => entry.name === 'Duel.GetLP')).toBe(true);
});

test('legacy flat resource directories are resolved through the native API', async () => {
  resolvedPaths = [];
  resources = new Map([
    ['_functions.txt', '●void Duel.LegacyInstalledFunction()\nLegacy function.'],
    ['constant.lua', 'LEGACY_CONSTANT=7'],
    ['def.lua', ''],
  ]);
  const catalog = await loadExternalLuaCatalog();
  expect(catalog?.functions.find((entry) => entry.name === 'Duel.LegacyInstalledFunction')?.description).toBe('Legacy function.');
  expect(catalog?.constants[0]?.name).toBe('LEGACY_CONSTANT');
  expect(resolvedPaths).toContain('lua-intel/_functions.txt');
  expect(resolvedPaths).toContain('_functions.txt');
});

test('browser mode uses the generated fallback without native resource calls', async () => {
  desktop = false;
  resolvedPaths = [];
  try {
    expect(await loadExternalLuaCatalog()).toBeNull();
    expect(resolvedPaths).toHaveLength(0);
  } finally {
    desktop = true;
  }
});
