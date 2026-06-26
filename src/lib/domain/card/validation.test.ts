import { describe, expect, test } from 'bun:test';
import { createEmptyCard } from './draft';
import { validateCardDraft } from './validation';

describe('validateCardDraft', () => {
  test('blocks an invalid card ID while preserving non-blocking warnings', () => {
    expect(validateCardDraft(createEmptyCard())).toEqual([
      { severity: 'error', code: 'invalid-code' },
      { severity: 'warning', code: 'empty-name' },
      { severity: 'warning', code: 'empty-type' },
    ]);
  });

  test('allows incomplete but identifiable cards to be committed with warnings', () => {
    const issues = validateCardDraft({ ...createEmptyCard(), code: 483 });
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
    expect(issues.filter((issue) => issue.severity === 'warning')).toHaveLength(2);
  });

  test('accepts a minimally complete card without issues', () => {
    expect(validateCardDraft({
      ...createEmptyCard(),
      code: 483,
      name: 'Test Card',
      type: 0x2,
    })).toEqual([]);
  });
});
