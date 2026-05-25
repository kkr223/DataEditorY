import { describe, expect, test } from 'bun:test';
import type { CardDataEntry } from '$lib/types';
import type { RenderCardPayload } from '$lib/types/render';
import { normalizeCardImageFormData } from '../layout';
import { createCardBaseData, createCardRenderPayload, createDocumentEdits } from '.';
import type { CardRenderResourceCache } from './resources';
import renderPayloadFixture from '../../../../../tests/fixtures/card-render-payload.json';

const baseCard: CardDataEntry = {
  code: 89631139,
  alias: 0,
  setcode: [0x3008],
  type: 0x1 | 0x10,
  attack: 3000,
  defense: 2500,
  level: 8,
  race: 0x2000,
  attribute: 0x10,
  category: 0,
  ot: 0,
  name: 'Blue-Eyes White Dragon',
  desc: 'This legendary dragon is a powerful engine of destruction.',
  strings: ['first'],
  lscale: 0,
  rscale: 0,
  linkMarker: 0,
  ruleCode: 0,
};

describe('card render payload', () => {
  test('builds app-level base data and document edits without renderer internals', () => {
    const form = normalizeCardImageFormData({
      name: 'Blue-Eyes White Dragon',
      description: 'A white dragon.',
      language: 'en',
      font: 'custom1',
      type: 'monster',
      cardType: 'normal',
      attribute: 'light',
      atk: 3000,
      def: 2500,
      level: 8,
      password: '89631139',
      rare: 'ur',
      package: 'LOB',
      copyright: 'en',
      laser: 'laser1',
      color: '#f3cc63',
      gradient: true,
      gradientColor1: '#8a5d17',
      gradientColor2: '#f8e6a2',
      twentieth: true,
      twentyFifth: true,
      descriptionAlign: true,
      firstLineCompress: true,
      scale: 0.43,
    });
    const base = createCardBaseData(baseCard, form);
    const edits = createDocumentEdits(baseCard, form);

    expect(base.kind).toBe('yugioh');
    expect(base.code).toBe(89631139);
    expect(base.alias).toBe(0);
    expect(base.ruleCode).toBe(0);
    expect(base.rare).toBe('ur');
    expect(base.language).toBe('en');
    expect(base.font).toBe('custom1');
    expect(base.twentieth).toBe(true);
    expect(base.twentyFifth).toBe(true);
    expect(base.scale).toBe(0.43);
    expect(base.descriptionAlign).toBe('center');
    expect(base.desc).toBe('A white dragon.');
    expect(edits.some((edit) => JSON.stringify(edit) === JSON.stringify({
      kind: 'setText',
      node_id: 'title',
      text: 'Blue-Eyes White Dragon',
    }))).toBe(true);
    expect(edits.some((edit) => JSON.stringify(edit) === JSON.stringify({
      kind: 'setTextFill',
      node_id: 'title',
      fill: { gradient: { start: '#8a5d17', end: '#f8e6a2' } },
    }))).toBe(true);
    expect(edits.some((edit) => JSON.stringify(edit) === JSON.stringify({
      kind: 'setFirstLineCompress',
      node_id: 'description',
      enabled: true,
    }))).toBe(true);
    expect('request' in base).toBe(false);
  });

  test('keeps image data urls behind explicit resource refs', async () => {
    const payload = await createCardRenderPayload(baseCard, normalizeCardImageFormData({
      image: 'data:image/png;base64,AAA',
      foregroundImage: '',
    }));

    expect(payload.base.kind).toBe('yugioh');
    expect(payload.resources?.artImage).toEqual({
      kind: 'dataUrl',
      dataUrl: 'data:image/png;base64,AAA',
    });
    expect(payload.resources?.foregroundImage).toBe(undefined);
  });

  test('can materialize image data urls into resource tokens', async () => {
    const resourceCache: CardRenderResourceCache = {
      resolveDataUrl: async (dataUrl) => ({ kind: 'resourceToken', token: `token:${dataUrl.length}` }),
      releaseAll: async () => undefined,
    };
    const payload = await createCardRenderPayload(baseCard, normalizeCardImageFormData({
      image: 'data:image/png;base64,AAA',
      foregroundImage: '',
    }), { resourceCache });

    expect(payload.resources?.artImage).toEqual({
      kind: 'resourceToken',
      token: 'token:25',
    });
  });

  test('matches the shared TypeScript/Rust render payload fixture', async () => {
    const payload = await createCardRenderPayload(baseCard, normalizeCardImageFormData({
      name: 'Blue-Eyes White Dragon',
      description: 'A white dragon.',
      language: 'en',
      font: 'custom1',
      type: 'monster',
      cardType: 'normal',
      attribute: 'light',
      atk: 3000,
      def: 2500,
      level: 8,
      password: '89631139',
      image: 'data:image/png;base64,AAA',
      rare: 'ur',
      color: '#f3cc63',
      gradient: true,
      gradientColor1: '#8a5d17',
      gradientColor2: '#f8e6a2',
      package: 'LOB',
      copyright: 'en',
      laser: 'laser1',
      twentieth: true,
      twentyFifth: true,
      descriptionAlign: true,
      foregroundImage: 'data:image/png;base64,BBB',
      foregroundWidth: 500,
      foregroundHeight: 400,
      foregroundX: 697,
      foregroundY: 1015.5,
      foregroundScale: 0.5,
      foregroundRotation: 15,
      effectBlockEnabled: true,
      effectBlockColor: '#f6f2e8',
      effectBlockOpacity: 0.78,
      firstLineCompress: true,
      scale: 0.43,
    }));

    expect(JSON.parse(JSON.stringify(payload))).toEqual(renderPayloadFixture as RenderCardPayload);
  });
});
