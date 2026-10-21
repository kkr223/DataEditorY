import { expect, test } from 'bun:test';
import { getTabsToClose, resolveContextCardIds } from './cardTargets';

test('right-click preserves a selection only when its target belongs to that selection', () => {
  const selected = [20, 30];
  expect(resolveContextCardIds(30, selected)).toEqual([20, 30]);
  expect(resolveContextCardIds(10, selected)).toEqual([10]);
  expect(resolveContextCardIds(10, [])).toEqual([10]);
  expect(selected).toEqual([20, 30]);
});

test('bulk database close respects tab order and excludes settings/text documents', () => {
  const tabs = [
    { id: 'a', kind: 'db' }, { id: 'settings', kind: 'settings' },
    { id: 'b', kind: 'db' }, { id: 'text', kind: 'text' }, { id: 'c', kind: 'db' },
  ];
  expect(getTabsToClose(tabs, 'b', 'others').map((tab) => tab.id)).toEqual(['a', 'c']);
  expect(getTabsToClose(tabs, 'b', 'right').map((tab) => tab.id)).toEqual(['c']);
  expect(getTabsToClose(tabs, 'c', 'right')).toEqual([]);
  expect(getTabsToClose(tabs, 'gone', 'others')).toEqual([]);
});
