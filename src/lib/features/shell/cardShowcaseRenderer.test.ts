import { describe, expect, test } from 'bun:test';
import {
  chunkShowcaseCards,
  getShowcaseLinkCount,
  getShowcaseLinkMarkers,
  getShowcaseTypeKeys,
  getShowcaseWrapUnits,
  stripCardAttribution,
} from './cardShowcaseRenderer';
import { LINK_MARKER_NAME_TO_BIT, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';

describe('card showcase renderer helpers', () => {
  test('removes attribution after a blank line or a custom marker', () => {
    expect(stripCardAttribution('Effect line\n\nAuthor: A')).toBe('Effect line');
    expect(stripCardAttribution('Line 1\r\nLine 2\r\n署名：A', '署名：')).toBe('Line 1\nLine 2');
    expect(stripCardAttribution('Effect only')).toBe('Effect only');
  });

  test('chunks cards using a bounded per-image limit', () => {
    expect(chunkShowcaseCards([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkShowcaseCards([1, 2], 0)).toEqual([[1, 2]]);
  });

  test('uses card-face subtype order and clockwise link markers', () => {
    expect(getShowcaseTypeKeys(TYPE_MAP.monster | SUBTYPE_MAP.fusion | SUBTYPE_MAP.effect)).toEqual([
      'editor.subtype.monster',
      'editor.subtype.fusion',
      'editor.subtype.effect',
    ]);
    expect(getShowcaseTypeKeys(TYPE_MAP.spell | SUBTYPE_MAP.quickplay)).toEqual([
      'editor.subtype.spell',
      'editor.subtype.quickplay',
    ]);
    const markers = LINK_MARKER_NAME_TO_BIT.up | LINK_MARKER_NAME_TO_BIT.down | LINK_MARKER_NAME_TO_BIT.upright;
    expect(getShowcaseLinkMarkers(markers)).toBe('↑↗↓');
    expect(getShowcaseLinkCount(markers)).toBe(3);
  });

  test('wraps CJK text by character even when it contains spaces', () => {
    expect(getShowcaseWrapUnits('中文 名称 与 文本')).toEqual(Array.from('中文 名称 与 文本'));
    expect(getShowcaseWrapUnits('English card name')).toEqual(['English', ' ', 'card', ' ', 'name']);
  });
});
