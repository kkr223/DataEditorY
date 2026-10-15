import { expect, test } from 'bun:test';
import { createCardImageOperations } from './imageOperations';

test('image uploads belong to their CDB and card, including a return to the same card', () => {
  let context = 'cdb1:100';
  const operations = createCardImageOperations(() => context);
  const first = operations.begin('foreground');
  context = 'cdb2:100';
  expect(first()).toBe(false);
  operations.reset();
  const second = operations.begin('foreground');
  context = 'cdb1:100';
  operations.reset();
  expect(first()).toBe(false);
  expect(second()).toBe(false);
  expect(operations.begin('foreground')()).toBe(true);
});

test('new uploads supersede older reads and destruction cancels every pending operation', () => {
  const operations = createCardImageOperations(() => 'cdb:100');
  const first = operations.begin('foreground');
  const second = operations.begin('foreground');
  const art = operations.begin('art');
  expect(first()).toBe(false);
  expect(second()).toBe(true);
  expect(art()).toBe(true);
  operations.dispose();
  expect(second()).toBe(false);
  expect(art()).toBe(false);
});
