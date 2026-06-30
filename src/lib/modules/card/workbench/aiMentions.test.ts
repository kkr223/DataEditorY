import { describe, expect, test } from 'bun:test';
import {
  buildMentionContextPrompt,
  createCardMentionContextRef,
  filterCardMentionContextRefsForText,
  findCardMentionDeleteRange,
  findCardMentionToken,
  removeCardMentionRange,
  replaceCardMention,
} from './aiMentions';
import type { CardDataEntry } from '$lib/types';

const card = {
  code: 1001,
  name: '测试卡',
  type: 1,
  attack: 1200,
  defense: 800,
  level: 4,
  desc: '效果文本',
  alias: 0,
  setcode: [],
  race: 1,
  attribute: 16,
  category: 0,
  ot: 0,
  strings: [],
  lscale: 0,
  rscale: 0,
  linkMarker: 0,
  ruleCode: 0,
} satisfies CardDataEntry;

describe('AI card mentions', () => {
  test('finds the active card mention token', () => {
    expect(findCardMentionToken('处理 @测试', 5)).toEqual({ start: 3, end: 5, query: '测' });
    expect(findCardMentionToken('mail@example')).toBeNull();
  });

  test('replaces the mention and builds card context', () => {
    const token = findCardMentionToken('看看 @测')!;
    expect(replaceCardMention('看看 @测', token, '测试卡')).toEqual({
      text: '看看 @测试卡 ',
      cursor: 8,
    });

    const prompt = buildMentionContextPrompt([createCardMentionContextRef(card)]);
    expect(prompt).toContain('1001 测试卡');
    expect(prompt).toContain('效果文本');
  });

  test('keeps card context only while the full mention exists', () => {
    const ref = createCardMentionContextRef(card);
    expect(filterCardMentionContextRefsForText('处理 @测试卡', [ref])).toEqual([ref]);
    expect(filterCardMentionContextRefsForText('处理 @测试', [ref])).toEqual([]);
  });

  test('deletes a selected card mention as one range', () => {
    const ref = createCardMentionContextRef(card);
    const text = '处理 @测试卡 后续';
    const cursor = text.indexOf('后续');
    const range = findCardMentionDeleteRange(text, cursor, cursor, [ref], 'Backspace');
    expect(range).toEqual({ start: 3, end: 8 });
    expect(removeCardMentionRange(text, range!)).toEqual({
      text: '处理 后续',
      cursor: 3,
    });
  });
});
