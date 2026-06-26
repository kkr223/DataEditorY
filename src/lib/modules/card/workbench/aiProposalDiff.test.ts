import { describe, expect, test } from 'bun:test';
import { createEmptyCard } from '$lib/domain/card/draft';
import type { AiProposalPayload } from './aiProposalPayload';
import {
  buildAiProposalDiffRows,
  getProposalCardCode,
  isProposalContextActive,
} from './aiProposalDiff';

describe('AI proposal diff', () => {
  test('renders structured before and after values for a card patch', () => {
    const card = { ...createEmptyCard(), code: 483, name: 'Before', attack: 1000 };
    expect(buildAiProposalDiffRows({
      text: '',
      contextRefs: [],
      cardPatch: { name: 'After', attack: 2000 },
    }, { card })).toEqual([
      { field: 'card.name', before: 'Before', after: 'After' },
      { field: 'card.attack', before: '1000', after: '2000' },
    ]);
  });

  test('reads the immutable target card from proposal context', () => {
    expect(getProposalCardCode({
      text: '',
      contextRefs: [{ type: 'card', label: '483 Test', value: { cardCode: 483 } }],
    })).toBe(483);
  });

  test('rejects applying a proposal after the user switches cards', () => {
    const payload = {
      text: '',
      contextRefs: [
        { type: 'cdb', label: 'cards.cdb', value: { path: '\\\\?\\D:\\Project\\cards.cdb' } },
        { type: 'card', label: '483 Test', value: { cardCode: 483 } },
      ],
    } satisfies AiProposalPayload;
    expect(isProposalContextActive(payload, {
      cdbPath: 'd:/project/cards.cdb',
      cardCode: 483,
    })).toBe(true);
    expect(isProposalContextActive(payload, {
      cdbPath: 'd:/project/cards.cdb',
      cardCode: 484,
    })).toBe(false);
  });
});
