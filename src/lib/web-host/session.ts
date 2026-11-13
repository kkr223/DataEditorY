import { CardDataEntry, type YGOProCdb } from 'ygopro-cdb-encode';
import type {
  CardCollectionCommand,
  CardCollectionQuery,
  CardSearchPage,
} from '#lib/modules/card/types.ts';
import type { CardDataEntry as WireCard } from '#lib/types/index.ts';
import { compileSearch } from './search.ts';

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

type UndoEntry =
  | { kind: 'upsert'; ids: number[]; previous: Array<WireCard | null> }
  | { kind: 'delete'; cards: WireCard[] };

export type WebSession = {
  id: string;
  db: YGOProCdb;
  path: string;
  undo: UndoEntry[];
};

export type WebSessionStore = {
  sessions: Map<string, WebSession>;
};

const CARD_FIELDS: Array<keyof WireCard> = [
  'code', 'alias', 'type', 'attack', 'defense', 'level', 'race', 'attribute',
  'category', 'ot', 'name', 'desc', 'lscale', 'rscale', 'linkMarker', 'ruleCode',
];

function plainCard(card: WireCard): WireCard {
  return {
    code: card.code,
    alias: card.alias ?? 0,
    setcode: [...(card.setcode ?? [])],
    type: card.type ?? 0,
    attack: card.attack ?? 0,
    defense: card.defense ?? 0,
    level: card.level ?? 0,
    race: card.race ?? 0,
    attribute: card.attribute ?? 0,
    category: card.category ?? 0,
    ot: card.ot ?? 0,
    name: card.name ?? '',
    desc: card.desc ?? '',
    strings: [...(card.strings ?? [])],
    lscale: card.lscale ?? 0,
    rscale: card.rscale ?? 0,
    linkMarker: card.linkMarker ?? 0,
    ruleCode: card.ruleCode ?? 0,
  };
}

function cardsEqual(left: WireCard | null | undefined, right: WireCard | null | undefined) {
  if (!left || !right) return left === right;
  return CARD_FIELDS.every((field) => left[field] === right[field])
    && (left.setcode ?? []).join(',') === (right.setcode ?? []).join(',')
    && (left.strings ?? []).join('\u0000') === (right.strings ?? []).join('\u0000');
}

function countAll(db: YGOProCdb) {
  const rows = db.database.exec(
    'SELECT COUNT(*) AS total FROM datas INNER JOIN texts ON datas.id = texts.id',
  );
  return Number(rows[0]?.values[0]?.[0] ?? 0);
}

function countWhere(db: YGOProCdb, clause: string, params: Record<string, unknown>) {
  const result = db.database.exec(
    `SELECT COUNT(*) AS total FROM datas INNER JOIN texts ON datas.id = texts.id WHERE ${clause}`,
    params as never,
  );
  return Number(result[0]?.values[0]?.[0] ?? 0);
}

function findCards(
  db: YGOProCdb,
  clause: string,
  params: Record<string, unknown>,
  extra = '',
): WireCard[] {
  return db.find(`${clause}${extra ? ` ${extra}` : ''}`, params as never) as unknown as WireCard[];
}

function getByIds(db: YGOProCdb, ids: number[]) {
  if (ids.length === 0) return [];
  const cards: WireCard[] = [];
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const params: Record<string, number> = {};
    const placeholders = chunk.map((id, offset) => {
      params[`id${offset}`] = id;
      return `:id${offset}`;
    });
    cards.push(...findCards(db, `datas.id IN (${placeholders.join(', ')})`, params));
  }
  return cards;
}

function insertCards(db: YGOProCdb, cards: WireCard[]) {
  db.addCard(cards.map((card) => new CardDataEntry().fromPartial(plainCard(card))));
}

function removeCards(db: YGOProCdb, ids: number[]) {
  for (let index = 0; index < ids.length; index += 400) {
    const chunk = ids.slice(index, index + 400);
    const params: Record<string, number> = {};
    const placeholders = chunk.map((id, offset) => {
      params[`id${offset}`] = id;
      return `:id${offset}`;
    });
    const clause = placeholders.join(', ');
    db.database.run(`DELETE FROM texts WHERE id IN (${clause})`, params);
    db.database.run(`DELETE FROM datas WHERE id IN (${clause})`, params);
  }
}

export function openSession(
  id: string,
  path: string,
  db: YGOProCdb,
): WebSession {
  return { id, db, path, undo: [] };
}

export function createSession(id: string, path: string, db: YGOProCdb, cards: WireCard[]) {
  if (cards.length > 0) insertCards(db, cards);
  return openSession(id, path, db);
}

export function openMetadata(db: YGOProCdb) {
  return {
    total: countAll(db),
    initialCards: findCards(db, '1=1', {}, 'ORDER BY datas.id LIMIT 50'),
  };
}

export function querySession(session: WebSession, query: CardCollectionQuery): unknown {
  const { db } = session;
  switch (query.kind) {
    case 'search': {
      const compiled = compileSearch(query.expression);
      const page = Math.max(1, query.page || 1);
      const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, query.pageSize || PAGE_SIZE_DEFAULT));
      const offset = (page - 1) * pageSize;
      const cards = findCards(
        db,
        compiled.clause,
        compiled.params,
        `ORDER BY datas.id LIMIT ${pageSize} OFFSET ${offset}`,
      );
      const response: CardSearchPage = {
        cards,
        total: countWhere(db, compiled.clause, compiled.params),
      };
      return response;
    }
    case 'searchAll': {
      const compiled = compileSearch(query.expression);
      return findCards(db, compiled.clause, compiled.params, 'ORDER BY datas.id');
    }
    case 'getById':
      return findCards(db, 'datas.id = :cardId', { cardId: query.cardId })[0] ?? null;
    case 'getByIds':
      return getByIds(db, query.cardIds);
    case 'findByNames': {
      if (query.names.length === 0) return [];
      const params: Record<string, string> = {};
      const placeholders = query.names.map((name, index) => {
        params[`name${index}`] = name;
        return `:name${index}`;
      });
      return findCards(db, `texts.name IN (${placeholders.join(', ')})`, params, 'ORDER BY datas.id');
    }
    case 'all':
      return findCards(db, '1=1', {}, 'ORDER BY datas.id');
    default:
      throw new Error(`Unsupported web query: ${(query as { kind: string }).kind}`);
  }
}

export function executeSession(session: WebSession, command: CardCollectionCommand): { changed: boolean; value?: unknown } {
  switch (command.kind) {
    case 'upsert': {
      const ids = command.cards.map((card) => card.code);
      const previous = getByIds(session.db, ids);
      const previousById = new Map(previous.map((card) => [card.code, card]));
      if (command.expectedCards) {
        if (command.expectedCards.length !== ids.length) {
          throw new Error('Card preconditions do not match the requested cards');
        }
        ids.forEach((id, index) => {
          const current = previousById.get(id) ?? null;
          const expected = command.expectedCards?.[index] ?? null;
          if (!cardsEqual(current, expected)) {
            throw new Error(`Card ${id} changed since it was reviewed. Review the current card before applying.`);
          }
        });
      }
      insertCards(session.db, command.cards);
      session.undo.push({
        kind: 'upsert',
        ids,
        previous: ids.map((id) => previousById.get(id) ?? null),
      });
      return { changed: true };
    }
    case 'delete': {
      const cards = getByIds(session.db, command.cardIds);
      removeCards(session.db, command.cardIds);
      session.undo.push({ kind: 'delete', cards });
      return { changed: true };
    }
    case 'replaceCardId': {
      if (command.card.code === command.originalCardId) {
        throw new Error('Replacement card ID must differ from the original ID');
      }
      const previous = getByIds(session.db, [command.originalCardId, command.card.code]);
      const target = previous.find((card) => card.code === command.card.code) ?? null;
      const original = previous.find((card) => card.code === command.originalCardId) ?? null;
      if (!cardsEqual(target, command.expectedTarget ?? null)) {
        throw new Error(`Card ${command.card.code} changed since it was reviewed. Review the current card before applying.`);
      }
      if (command.removeOriginal !== false) {
        removeCards(session.db, [command.originalCardId]);
      }
      insertCards(session.db, [command.card]);
      session.undo.push({
        kind: 'upsert',
        ids: [command.card.code, command.originalCardId],
        previous: [target, original],
      });
      return {
        changed: true,
        value: {
          cardIdChange: {
            originalCardId: command.originalCardId,
            newCardId: command.card.code,
            removeOriginal: command.removeOriginal !== false,
            cdbPath: session.path,
          },
        },
      };
    }
  }
}

export function undoSession(session: WebSession) {
  const entry = session.undo.pop();
  if (!entry) return { changed: false };
  if (entry.kind === 'delete') {
    insertCards(session.db, entry.cards);
    return { changed: true, value: { undone: true } };
  }
  const restore: WireCard[] = [];
  const remove: number[] = [];
  entry.ids.forEach((id, index) => {
    const card = entry.previous[index];
    if (card) restore.push(card);
    else remove.push(id);
  });
  if (restore.length > 0) insertCards(session.db, restore);
  if (remove.length > 0) removeCards(session.db, remove);
  return { changed: true, value: { undone: true } };
}

export function saveSession(session: WebSession, destinationUri?: string) {
  const bytes = session.db.export();
  if (destinationUri) session.path = destinationUri;
  return { sourceUri: session.path, bytes };
}
