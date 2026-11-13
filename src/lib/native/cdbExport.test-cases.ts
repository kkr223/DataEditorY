import * as bunTest from 'bun:test';
import initSqlJs from 'sql.js';
import { YGOProCdb, CardDataEntry } from 'ygopro-cdb-encode';

const { test, expect } = bunTest;
const mock = (bunTest as unknown as {
  mock: { module: (specifier: string, factory: () => unknown) => void };
}).mock;
const SQL = await initSqlJs();
const output = new Map<string, Uint8Array>();
let failWrite = false;
mock.module('#lib/web-host/sql.ts', () => ({ loadSql: async () => SQL }));
mock.module('#lib/platform/host/index.ts', () => ({ host: {
  kind: 'web',
  fs: { writeBinary: async (path: string, bytes: Uint8Array) => {
    if (failWrite) throw new Error('write failed');
    output.set(path, bytes);
  } },
} }));
mock.module('#lib/platform/appRuntime.ts', () => ({ documentRuntime: {} }));
mock.module('#lib/stores/db.ts', () => ({ getCardsByIdsInTab() {}, modifyCardsInTab() {} }));
const { documentHostTransport } = await import('#lib/platform/transport/inline.ts');
let closed = 0;
const close = documentHostTransport.close.bind(documentHostTransport);
documentHostTransport.close = async (request) => { closed++; await close(request); };
mock.module('#lib/platform/transport/active.ts', () => ({ documentHostTransport }));
const { createCdbFromCards } = await import('./cdbApi.ts');

test('filtered export writes a CDB through the transport and releases its temporary session', async () => {
  const cards = [new CardDataEntry().fromPartial({ code: 123, name: 'exported', type: 1 })];
  await createCdbFromCards('filtered.cdb', cards);
  const db = new YGOProCdb(SQL).from(output.get('filtered.cdb')!);
  try {
    expect(db.find().map((card) => [card.code, card.name])).toEqual([[123, 'exported']]);
    expect(closed).toBe(1);
  } finally { db.finalize(); }
});

test('failed exports close the temporary session and propagate the write error', async () => {
  failWrite = true;
  try {
    await expect(createCdbFromCards('failed.cdb', [])).rejects.toThrow('write failed');
    expect(output.has('failed.cdb')).toBe(false);
    expect(closed).toBe(2);
  } finally { failWrite = false; }
});
