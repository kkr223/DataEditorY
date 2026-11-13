import * as bunTest from 'bun:test';
import { createEmptyCard } from '#lib/domain/card/draft.ts';
import { createCardImageFormData } from './layout';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as { mock: { module: (name: string, factory: () => unknown) => void } }).mock;
let existing = new Set<string>();
let written: string[] = [];
let renderCount = 0;
let failField = false;
let limits: number[] = [];
let removedHosts = 0;
mock.module('#lib/stores/appSettings.svelte.ts', () => ({ appSettingsState: { values: { cardImageMaxSizeKb: 250 } } }));
mock.module('#lib/platform/host/index.ts', () => ({ host: {
  kind: 'web',
  media: { resolveResource: async (path: string) => path },
} }));
mock.module('#lib/native/assetApi.ts', () => ({
  readImageFile: async () => [],
  pathExists: async (path: string) => existing.has(path),
  writeBinaryFile: async (path: string) => { written.push(path); },
}));
mock.module('#lib/utils/mediaProtocol.ts', () => ({ toMediaProtocolSrc: (path: string) => `media:${path}` }));
mock.module('./exportCompression', () => ({ compressCardImageForExport: async (blob: Blob, _format: string, limit: number) => {
  limits.push(limit); return blob;
} }));
mock.module('yugioh-card-ts', () => ({ YugiohCard: class {
  leafer = {};
  constructor() { renderCount++; }
  async export() { return new Blob(['card'], { type: 'image/jpeg' }); }
  destroy() {}
} }));
Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, location: { origin: 'http://local' } } });
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  body: { appendChild() {} },
  createElement: (tag: string) => tag === 'canvas' ? {
    getContext: () => ({ clearRect() {}, drawImage() {} }),
    toBlob: (done: (blob: Blob | null) => void) => done(failField ? null : new Blob(['field'], { type: 'image/jpeg' })),
  } : { style: {}, remove() { removedHosts++; } },
} });
Object.defineProperty(globalThis, 'Image', { configurable: true, value: class { async decode() {} } });

const { buildBatchCardImageForm, exportBatchCardImage } = await import('./exporter');
const card = { ...createEmptyCard(), code: 123, type: 0x21, race: 1, name: 'Current card' };
const preset = { language: 'jp' as const, rare: '', laser: '', copyright: 'jp', exportScalePercent: 43, usePerCardOverrides: true };
const input = { card, artPath: '/art/123.png', outputDir: '/out', cdbPath: '/workspace/a.cdb', preset, overwrite: true };
const config = (form: ReturnType<typeof createCardImageFormData>) => ({ kind: 'dataeditory-card-image-config' as const, version: 1 as const, form });

test('batch language wins over saved language and automatic translated fields follow it', () => {
  const saved = createCardImageFormData(card, 'en');
  const actual = buildBatchCardImageForm({ ...input, perCardDocument: config(saved) });
  const japanese = createCardImageFormData(card, 'jp');
  expect(actual.language).toBe('jp');
  expect(actual.monsterType).toBe(japanese.monsterType);
  expect(actual.scale).toBe(0.43);
  expect(actual.image).toBe('media:/art/123.png');
  saved.monsterType = 'Custom type';
  expect(buildBatchCardImageForm({ ...input, perCardDocument: config(saved) }).monsterType).toBe('Custom type');
});

test('saved foreground and rarity mask references resolve within the captured source CDB', () => {
  const form = createCardImageFormData(card, 'jp');
  form.foregroundImage = 'workspace-asset:card-image/123/foreground.png';
  form.rarityMaskImage = 'workspace-asset:card-image/123/rarity-mask.png';
  const actual = buildBatchCardImageForm({ ...input, perCardDocument: config(form) });
  expect(actual.foregroundImage).toBe('media:/workspace/.dey/card-image/123/foreground.png');
  expect(actual.rarityMaskImage).toBe('media:/workspace/.dey/card-image/123/rarity-mask.png');
  expect(buildBatchCardImageForm({ ...input, preset: { ...preset, usePerCardOverrides: false }, perCardDocument: config(form) }).foregroundImage).toBe('');
});

test('disabling overwrite also protects an existing field image before rendering', async () => {
  existing = new Set(['/out/field/123.jpg']);
  written = []; renderCount = 0;
  const result = await exportBatchCardImage({ ...input, card: { ...card, type: 0x80002 }, overwrite: false });
  expect(result.skipped).toBe(true);
  expect(renderCount).toBe(0);
  expect(written).toEqual([]);
});

test('field rendering failure does not write the main image', async () => {
  existing.clear(); written = []; failField = true;
  let failed = false;
  try { await exportBatchCardImage({ ...input, card: { ...card, type: 0x80002 } }); }
  catch { failed = true; }
  finally { failField = false; }
  expect(failed).toBe(true);
  expect(written).toEqual([]);
});

test('batch jobs use their captured compression limit for both files and release rendering hosts', async () => {
  written = []; limits = []; removedHosts = 0;
  const result = await exportBatchCardImage({ ...input, card: { ...card, type: 0x80002 }, maxSizeKb: 100 });
  expect(result.fieldOutputPath).toBe('/out/field/123.jpg');
  expect(written).toEqual(['/out/123.jpg', '/out/field/123.jpg']);
  expect(limits).toEqual([100, 100]);
  expect(removedHosts).toBe(1);
});
