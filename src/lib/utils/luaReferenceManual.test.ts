import { describe, expect, test } from 'bun:test';
import { resolveReferenceManualInsertText, type LuaReferenceManualItem } from './luaReferenceManual';

describe('lua reference manual insertion', () => {
  test('converts card namespace functions to method-style insertion when requested', () => {
    const item: LuaReferenceManualItem = {
      key: 'function:Card.IsType',
      kind: 'functions',
      title: 'Card.IsType',
      detail: 'boolean Card.IsType(Card c, int type)',
      description: 'Checks the card type.',
      category: 'Card',
      valueText: '',
      insertText: 'Card.IsType(${1:c}, ${2:type})',
      insertAsSnippet: true,
      searchText: 'card.istype',
      namespace: 'Card',
      shortName: 'IsType',
      parameters: ['Card c', 'int type'],
    };

    expect(resolveReferenceManualInsertText(item, { useMethodSyntax: true })).toBe('IsType(${1:type})');
    expect(resolveReferenceManualInsertText(item, { useMethodSyntax: false })).toBe('Card.IsType(${1:c}, ${2:type})');
  });
});
