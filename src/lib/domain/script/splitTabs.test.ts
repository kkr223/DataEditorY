import { expect, test } from 'bun:test';
import { getPairSurvivor, groupScriptTabs } from './splitTabs';

test('a pair appears once, preserving left/right identity even when tab order is reversed', () => {
  const tabs = ['before', 'right', 'middle', 'left', 'after'].map((id) => ({ id }));
  expect(groupScriptTabs(tabs, { leftId: 'left', rightId: 'right' }).map((group) => group.map((tab) => tab.id)))
    .toEqual([['before'], ['left', 'right'], ['middle'], ['after']]);
  expect(tabs.map((tab) => tab.id)).toEqual(['before', 'right', 'middle', 'left', 'after']);
});

test('closing either side identifies the surviving script, while unrelated closes do not dissolve it', () => {
  const pair = { leftId: 'a', rightId: 'b' };
  expect(getPairSurvivor(pair, 'a')).toBe('b');
  expect(getPairSurvivor(pair, 'b')).toBe('a');
  expect(getPairSurvivor(pair, 'c')).toBeNull();
});

test('stale pairs from another workspace and self-pairs remain ordinary tabs', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }];
  expect(groupScriptTabs(tabs, { leftId: 'a', rightId: 'missing' })).toEqual([[tabs[0]], [tabs[1]]]);
  expect(groupScriptTabs(tabs, { leftId: 'a', rightId: 'a' })).toEqual([[tabs[0]], [tabs[1]]]);
});
