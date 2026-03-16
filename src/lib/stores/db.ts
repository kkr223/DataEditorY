import { writable, get, derived } from 'svelte/store';
import initSqlJs from 'sql.js';
import { YGOProCdb, CardDataEntry } from 'ygopro-cdb-encode';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import type { SearchFilters } from '$lib/types';

export interface CdbTab {
  id: string;
  path: string;
  name: string;
  cdb: YGOProCdb;
  /** Cached current page results from last search for fast tab switching */
  cachedCards: CardDataEntry[];
  cachedTotal: number;
  cachedPage: number;
  cachedFilters: string; // JSON of the filters used for the cache
}

export const tabs = writable<CdbTab[]>([]);
export const activeTabId = writable<string | null>(null);

export const activeTab = derived(
  [tabs, activeTabId],
  ([$tabs, $activeTabId]) => $tabs.find(t => t.id === $activeTabId) || null
);

export const isDbLoaded = derived(activeTab, ($activeTab) => $activeTab !== null);

let sqlJsInstance: initSqlJs.SqlJsStatic | null = null;

function toLikePattern(input: string): string {
  const normalized = input.trim();
  if (!normalized) return '%';

  const hasWildcard = normalized.includes('%') || normalized.includes('_');
  const pattern = normalized.replace(/%%/g, '%');
  return hasWildcard ? pattern : `%${pattern}%`;
}

function parseSetcodeFilter(input: string): number | null {
  const normalized = input.trim();
  if (!normalized) return null;

  const hex = normalized.toLowerCase().startsWith('0x') ? normalized.slice(2) : normalized;
  if (!/^[\da-f]{1,4}$/i.test(hex)) return null;

  return parseInt(hex, 16) & 0xffff;
}

async function initDb() {
  if (!sqlJsInstance) {
    sqlJsInstance = await initSqlJs({
      locateFile: file => `/${file}`
    });
  }
}

function buildSearchQuery(filters: SearchFilters = {}) {
  const conditions: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.name) {
    conditions.push('(texts.name LIKE :name OR texts.desc LIKE :name)');
    params.name = toLikePattern(filters.name);
  }

  if (filters.id) {
    const parsedId = parseInt(filters.id);
    if (!isNaN(parsedId)) {
      conditions.push('(datas.id = :id OR datas.alias = :id)');
      params.id = parsedId;
    }
  }

  if (filters.desc) {
    conditions.push('texts.desc LIKE :desc');
    params.desc = toLikePattern(filters.desc);
  }

  if (filters.atkMin !== '' && filters.atkMin !== undefined) {
    const v = parseInt(filters.atkMin.toString());
    if (!isNaN(v)) conditions.push(`datas.atk >= ${v}`);
  }
  if (filters.atkMax !== '' && filters.atkMax !== undefined) {
    const v = parseInt(filters.atkMax.toString());
    if (!isNaN(v)) conditions.push(`datas.atk <= ${v} AND datas.atk >= 0`);
  }
  if (filters.defMin !== '' && filters.defMin !== undefined) {
    const v = parseInt(filters.defMin.toString());
    if (!isNaN(v)) conditions.push(`datas.def >= ${v}`);
  }
  if (filters.defMax !== '' && filters.defMax !== undefined) {
    const v = parseInt(filters.defMax.toString());
    if (!isNaN(v)) conditions.push(`datas.def <= ${v} AND datas.def >= 0`);
  }

  if (filters.type && TYPE_MAP[filters.type] !== undefined) {
    const typeBit = TYPE_MAP[filters.type];
    conditions.push(`(datas.type & ${typeBit}) = ${typeBit}`);
  }

  if (filters.subtype) {
    let subtypeBit: number | undefined;
    if (filters.subtype === 'continuous_spell' || filters.subtype === 'continuous_trap') subtypeBit = 0x20000;
    else if (filters.subtype === 'ritual_spell') subtypeBit = 0x80;
    else subtypeBit = SUBTYPE_MAP[filters.subtype];
    if (subtypeBit !== undefined) conditions.push(`(datas.type & ${subtypeBit}) = ${subtypeBit}`);
  }

  if (filters.attribute && ATTRIBUTE_MAP[filters.attribute] !== undefined) {
    conditions.push(`datas.attribute = ${ATTRIBUTE_MAP[filters.attribute]}`);
  }

  if (filters.race && RACE_MAP[filters.race] !== undefined) {
    conditions.push(`datas.race = ${RACE_MAP[filters.race]}`);
  }

  const setcodeFilters = [filters.setcode1, filters.setcode2, filters.setcode3, filters.setcode4];
  for (const rawValue of setcodeFilters) {
    if (!rawValue) continue;
    const parsedSetcode = parseSetcodeFilter(rawValue);
    if (parsedSetcode === null) continue;
    conditions.push(
      `(
        ((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = ${parsedSetcode}
        OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = ${parsedSetcode}
      )`
    );
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
  };
}

// --- Type/Attribute/Race bit constants from YGOPro ---
const TYPE_MAP: Record<string, number> = {
  monster: 0x1,
  spell: 0x2,
  trap: 0x4,
};

const ATTRIBUTE_MAP: Record<string, number> = {
  earth: 0x01,
  water: 0x02,
  fire: 0x04,
  wind: 0x08,
  light: 0x10,
  dark: 0x20,
  divine: 0x40,
};

const RACE_MAP: Record<string, number> = {
  warrior: 0x1,
  spellcaster: 0x2,
  fairy: 0x4,
  fiend: 0x8,
  zombie: 0x10,
  machine: 0x20,
  aqua: 0x40,
  pyro: 0x80,
  rock: 0x100,
  wingedbeast: 0x200,
  plant: 0x400,
  insect: 0x800,
  thunder: 0x1000,
  dragon: 0x2000,
  beast: 0x4000,
  beastwarrior: 0x8000,
  dinosaur: 0x10000,
  fish: 0x20000,
  seaserpent: 0x40000,
  reptile: 0x80000,
  psychic: 0x100000,
  divinebeast: 0x200000,
  creatorgod: 0x400000,
  wyrm: 0x800000,
  cyberse: 0x1000000,
  illusion: 0x2000000,
};

// Sub-type bit constants
export const SUBTYPE_MAP: Record<string, number> = {
  // Monster sub-types
  normal: 0x10,
  effect: 0x20,
  fusion: 0x40,
  ritual: 0x80,
  spirit: 0x200,
  union: 0x400,
  gemini: 0x800,
  tuner: 0x1000,
  synchro: 0x2000,
  token: 0x4000,
  flip: 0x200000,
  toon: 0x400000,
  xyz: 0x800000,
  pendulum: 0x1000000,
  spssummon: 0x2000000,
  link: 0x4000000,
  // Spell sub-types
  quickplay: 0x10000,
  continuous_spell: 0x20000,
  equip: 0x40000,
  field: 0x80000,
  ritual_spell: 0x80,
  // Trap sub-types
  continuous_trap: 0x20000,
  counter: 0x100000,
};

/** Open a .cdb file and add it as a new tab. Returns the tab id or null. */
export async function openCdbFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    const existing = get(tabs).find(t => t.path === selected);
    if (existing) {
      activeTabId.set(existing.id);
      return existing.id;
    }

    await initDb();
    try {
      const data: number[] = await invoke('read_cdb', { path: selected });
      const cdb = new YGOProCdb(sqlJsInstance as any).from(new Uint8Array(data));
      
      const name = await basename(selected).catch(() => 'unknown.cdb');
      const id = crypto.randomUUID();
      
      // Pre-cache first page so tab switch is instant
      let cachedCards: CardDataEntry[] = [];
      let cachedTotal = 0;
      try {
        const totalResult = cdb.database.exec('SELECT COUNT(*) AS total FROM datas INNER JOIN texts ON datas.id = texts.id');
        cachedTotal = totalResult.length > 0 ? Number(totalResult[0].values[0]?.[0] ?? 0) : 0;
        cachedCards = cdb.find('1=1 ORDER BY datas.id LIMIT 50 OFFSET 0');
      } catch { /* empty db */ }
      
      const tab: CdbTab = {
        id,
        path: selected,
        name,
        cdb,
        cachedCards,
        cachedTotal,
        cachedPage: 1,
        cachedFilters: '{}'
      };
      tabs.update(t => [...t, tab]);
      activeTabId.set(id);
      return id;
    } catch (err) {
      console.error("Failed to read CDB:", err);
      return null;
    }
  }
  return null;
}

/** Create a new .cdb file, save it and open as a new tab. */
export async function createCdbFile(): Promise<string | null> {
  const selected = await save({
    title: 'Create New CDB',
    filters: [{
      name: 'YGOPro CDB Database',
      extensions: ['cdb']
    }]
  });

  if (selected && typeof selected === 'string') {
    await initDb();
    try {
      // The library constructor already creates an empty in-memory database
      // and initializes the standard datas/texts tables for us.
      const cdb = new YGOProCdb(sqlJsInstance as any);

      // Save initial file to disk immediately so it exists
      const bytes = cdb.export();
      await invoke('write_cdb', { path: selected, data: Array.from(bytes) });

      const name = await basename(selected).catch(() => 'newcard.cdb');
      const id = crypto.randomUUID();
      
      const tab: CdbTab = {
        id,
        path: selected,
        name,
        cdb,
        cachedCards: [],
        cachedTotal: 0,
        cachedPage: 1,
        cachedFilters: '{}'
      };
      tabs.update(t => [...t, tab]);
      activeTabId.set(id);
      return id;
    } catch (err) {
      console.error("Failed to create CDB:", err);
      return null;
    }
  }
  return null;
}

/** Close a tab by its id */
export function closeTab(tabId: string) {
  const currentTabs = get(tabs);
  const idx = currentTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const newTabs = currentTabs.filter(t => t.id !== tabId);
  tabs.set(newTabs);

  if (get(activeTabId) === tabId) {
    if (newTabs.length > 0) {
      const newIdx = Math.min(idx, newTabs.length - 1);
      activeTabId.set(newTabs[newIdx].id);
    } else {
      activeTabId.set(null);
    }
  }
}

/** Save the active tab's CDB back to disk */
export async function saveCdbFile(): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    const bytes = tab.cdb.export();
    await invoke('write_cdb', { path: tab.path, data: Array.from(bytes) });
    return true;
  } catch (err) {
    console.error("Failed to save CDB:", err);
    return false;
  }
}

/** Get cached cards for the active tab (for instant tab switching) */
export function getCachedCards(): CardDataEntry[] {
  const tab = get(activeTab);
  return tab ? tab.cachedCards : [];
}

export function getCachedTotal(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedTotal : 0;
}

export function getCachedPage(): number {
  const tab = get(activeTab);
  return tab ? tab.cachedPage : 1;
}

export function getCachedFilters(): SearchFilters {
  const tab = get(activeTab);
  if (!tab) return {};

  try {
    return JSON.parse(tab.cachedFilters) as SearchFilters;
  } catch {
    return {};
  }
}

export function getCardById(cardId: number): CardDataEntry | undefined {
  const tab = get(activeTab);
  if (!tab) return undefined;
  return tab.cdb.findById(cardId);
}

/** Modify (upsert) a card in the active tab's in-memory CDB */
export function modifyCard(card: CardDataEntry): boolean {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    // addCard does an INSERT OR REPLACE, so it works for both insert and update
    tab.cdb.addCard(card);
    return true;
  } catch (err) {
    console.error("Failed to modify card:", err);
    return false;
  }
}

export function modifyCards(cards: CardDataEntry[]): boolean {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    tab.cdb.addCard(cards);
    return true;
  } catch (err) {
    console.error("Failed to modify cards:", err);
    return false;
  }
}

/** Delete a card from the active tab's in-memory CDB by id */
export function deleteCard(cardId: number): boolean {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    tab.cdb.database.run('DELETE FROM datas WHERE id = ?', [cardId]);
    tab.cdb.database.run('DELETE FROM texts WHERE id = ?', [cardId]);
    return true;
  } catch (err) {
    console.error("Failed to delete card:", err);
    return false;
  }
}

export function deleteCards(cardIds: number[]): boolean {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    for (const cardId of cardIds) {
      tab.cdb.database.run('DELETE FROM datas WHERE id = ?', [cardId]);
      tab.cdb.database.run('DELETE FROM texts WHERE id = ?', [cardId]);
    }
    return true;
  } catch (err) {
    console.error("Failed to delete cards:", err);
    return false;
  }
}

/** Search one page of cards in the active tab's CDB */
export function searchCardsPage(filters: SearchFilters = {}, page = 1, pageSize = 50): { cards: CardDataEntry[]; total: number } {
  const tab = get(activeTab);
  if (!tab) return { cards: [], total: 0 };

  try {
    const { whereClause, params } = buildSearchQuery(filters);
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * pageSize;
    const totalStmt = `SELECT COUNT(*) AS total FROM datas INNER JOIN texts ON datas.id = texts.id WHERE ${whereClause}`;
    const totalResult = tab.cdb.database.exec(totalStmt, params);
    const total = totalResult.length > 0 ? Number(totalResult[0].values[0]?.[0] ?? 0) : 0;
    const cards = tab.cdb.find(`${whereClause} ORDER BY datas.id LIMIT ${pageSize} OFFSET ${offset}`, params);

    tab.cachedCards = cards;
    tab.cachedTotal = total;
    tab.cachedPage = safePage;
    tab.cachedFilters = JSON.stringify(filters);

    return { cards, total };
  } catch (err) {
    console.error("Search failed:", err);
    return { cards: [], total: 0 };
  }
}
