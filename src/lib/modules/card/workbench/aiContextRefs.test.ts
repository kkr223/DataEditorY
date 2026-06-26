import { describe, expect, test } from 'bun:test';
import { mergeWorkspaceAiContextRefs } from './aiContextRefs';

describe('mergeWorkspaceAiContextRefs', () => {
  test('preserves script task context while refreshing the active card context', () => {
    const merged = mergeWorkspaceAiContextRefs(
      [
        { type: 'script', label: 'c1001.lua', value: { path: 'script/c1001.lua' } },
        { type: 'card', label: '1001 Old name', value: { cardCode: 1001 } },
      ],
      [
        { type: 'cdb', label: 'cards.cdb', value: { path: 'cards.cdb' } },
        { type: 'card', label: '1001 New name', value: { cardCode: 1001 } },
      ],
    );

    expect(merged.map((ref) => ref.type)).toEqual(['script', 'card', 'cdb']);
    expect(merged[0].label).toBe('c1001.lua');
    expect(merged[1].label).toBe('1001 New name');
  });

  test('lets current context replace the same typed and labelled reference', () => {
    const merged = mergeWorkspaceAiContextRefs(
      [{ type: 'cdb', label: 'cards.cdb', value: { revision: 1 } }],
      [{ type: 'cdb', label: 'cards.cdb', value: { revision: 2 } }],
    );

    expect(merged).toEqual([
      { type: 'cdb', label: 'cards.cdb', value: { revision: 2 } },
    ]);
  });
});
