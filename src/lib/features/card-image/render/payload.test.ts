import { describe, expect, test } from 'bun:test';
import type { CardDataEntry } from '$lib/types';
import { normalizeCardImageFormData } from '../layout';
import { createCardRenderDraft, createCardRenderPayload } from '.';

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
  test('builds an app-level render draft without renderer internals', () => {
    const draft = createCardRenderDraft(baseCard, normalizeCardImageFormData({
      name: 'Blue-Eyes White Dragon',
      description: 'A white dragon.',
      language: 'en',
      type: 'monster',
      cardType: 'normal',
      attribute: 'light',
      atk: 3000,
      def: 2500,
      level: 8,
      password: '89631139',
      rare: 'ur',
      color: '#f3cc63',
      gradient: true,
      gradientColor1: '#8a5d17',
      gradientColor2: '#f8e6a2',
      firstLineCompress: true,
      scale: 0.43,
    }));

    expect(draft.kind).toBe('yugioh');
    expect(draft.identity).toEqual({
      code: 89631139,
      alias: 0,
      ruleCode: 0,
      passwordText: '89631139',
    });
    expect(draft.localizedText.description).toBe('A white dragon.');
    expect(draft.visualStyle.rare).toBe('ur');
    expect(draft.visualStyle.nameColor).toEqual({ kind: 'custom', value: '#f3cc63' });
    expect(draft.visualStyle.nameGradient).toEqual({ start: '#8a5d17', end: '#f8e6a2' });
    expect(draft.outputOptions).toEqual({
      language: 'en',
      scale: 0.43,
      descriptionFirstLineCompress: true,
    });
    expect('request' in draft).toBe(false);
  });

  test('keeps image data urls behind explicit resource refs', async () => {
    const payload = await createCardRenderPayload(baseCard, normalizeCardImageFormData({
      image: 'data:image/png;base64,AAA',
      foregroundImage: '',
    }));

    expect(payload.draft.kind).toBe('yugioh');
    expect(payload.resources?.artImage).toEqual({
      kind: 'dataUrl',
      dataUrl: 'data:image/png;base64,AAA',
    });
    expect(payload.resources?.foregroundImage).toBe(undefined);
  });
});
