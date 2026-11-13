import * as bunTest from 'bun:test';
import initSqlJs from 'sql.js';
import { CardDataEntry, YGOProCdb } from 'ygopro-cdb-encode';
import { createSession, executeSession, querySession, undoSession, type WebSession } from './session.ts';
import type { CardSearchPage } from '#lib/modules/card/types.ts';

const { expect, test } = bunTest;
const { afterEach } = bunTest as unknown as { afterEach: (run: () => void) => void };
const SQL = await initSqlJs();
const sessions: WebSession[] = [];
afterEach(() => { for (const session of sessions.splice(0)) session.db.finalize(); });

function card(code: number, name = 'match') {
  return new CardDataEntry().fromPartial({
    code, name, type: 1, alias: 0, attack: 0, defense: 0, attribute: 0,
    level: 0, linkMarker: 0, lscale: 0, rscale: 0, race: 0, ruleCode: 0, setcode: [],
  });
}

function session(cards = [card(123)]) {
  const result = createSession('test', 'test.cdb', new YGOProCdb(SQL), cards);
  sessions.push(result);
  return result;
}

test('conditional search counts every match across pages', () => {
  const current = session(Array.from({ length: 55 }, (_, index) => card(index + 1)));
  const page = querySession(current, {
    kind: 'search', expression: { kind: 'textContains', field: 'name', value: 'match' },
    page: 2, pageSize: 50,
  }) as CardSearchPage;
  expect(page.total).toBe(55);
  expect(page.cards.map((entry) => entry.code)).toEqual([51, 52, 53, 54, 55]);
});

test('delete binds each chunk and undo restores the deleted cards', () => {
  const cards = Array.from({ length: 405 }, (_, index) => card(index + 1));
  const current = session(cards);
  executeSession(current, { kind: 'delete', cardIds: cards.map((entry) => entry.code) });
  expect(querySession(current, { kind: 'all' })).toEqual([]);
  undoSession(current);
  expect(querySession(current, { kind: 'all' })).toHaveLength(405);
});

test('undoing an upsert removes new cards and restores overwritten cards', () => {
  const current = session();
  executeSession(current, { kind: 'upsert', cards: [card(123, 'changed'), card(124)] });
  undoSession(current);
  expect(querySession(current, { kind: 'all' })).toEqual([card(123)]);
});

test('renaming a card removes the original and undo restores both IDs', () => {
  const current = session([card(123), card(124, 'target')]);
  executeSession(current, {
    kind: 'replaceCardId', originalCardId: 123, card: card(124),
    expectedTarget: card(124, 'target'), removeOriginal: true,
  });
  expect(querySession(current, { kind: 'getById', cardId: 123 })).toBeNull();
  undoSession(current);
  expect(querySession(current, { kind: 'all' })).toEqual([card(123), card(124, 'target')]);
});
