import { describe, expect, test } from 'bun:test';
import { READONLY_PROPOSAL_TOOL_NAMES } from './service';

describe('AI workspace service boundaries', () => {
  test('proposal runner only exposes read-only tools', () => {
    const tools: string[] = [...READONLY_PROPOSAL_TOOL_NAMES];
    expect(tools.includes('search_cards')).toBe(true);
    expect(tools.includes('read_card_script')).toBe(true);
    expect(tools.includes('apply_batch_card_edit')).toBe(false);
  });
});
