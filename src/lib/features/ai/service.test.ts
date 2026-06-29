import { describe, expect, test } from 'bun:test';
import { normalizeAiCardPatch, READONLY_PROPOSAL_TOOL_NAMES } from './service';

describe('AI workspace service boundaries', () => {
  test('proposal runner only exposes read-only tools', () => {
    const tools: string[] = [...READONLY_PROPOSAL_TOOL_NAMES];
    expect(tools.includes('search_cards')).toBe(true);
    expect(tools.includes('read_card_script')).toBe(true);
    expect(tools.includes('apply_batch_card_edit')).toBe(false);
  });

  test('normalizes AI card patches to real card fields', () => {
    expect(normalizeAiCardPatch({
      atk: '2500',
      def: '?',
      name: 'Test',
      code: 123,
      unknown: true,
      setcode: ['452', 'bad', 4660],
    })).toEqual({
      attack: 2500,
      defense: -2,
      name: 'Test',
      setcode: [452, 4660],
    });
  });
});
