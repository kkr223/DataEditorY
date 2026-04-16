import { writable } from 'svelte/store';

export interface RecentCdbEntry {
  path: string;
  name: string;
}

export const RECENT_CDB_HISTORY_KEY = 'recent-cdb-history';
export const MAX_RECENT_CDB_HISTORY = 6;

export const recentCdbHistory = writable<RecentCdbEntry[]>([]);

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeRecentCdbHistory(value: unknown): RecentCdbEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaths = new Set<string>();
  const entries: RecentCdbEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;

    const path = typeof item.path === 'string' ? item.path.trim() : '';
    if (!path || seenPaths.has(path)) continue;

    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : path.split(/[/\\]/).pop() || path;

    seenPaths.add(path);
    entries.push({ path, name });

    if (entries.length >= MAX_RECENT_CDB_HISTORY) {
      break;
    }
  }

  return entries;
}

function persistRecentCdbHistory(entries: RecentCdbEntry[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(RECENT_CDB_HISTORY_KEY, JSON.stringify(entries));
}

export function pushRecentCdbEntry(entry: RecentCdbEntry) {
  recentCdbHistory.update((current) => {
    const next = [
      entry,
      ...current.filter((item) => item.path !== entry.path),
    ].slice(0, MAX_RECENT_CDB_HISTORY);
    persistRecentCdbHistory(next);
    return next;
  });
}

export function loadRecentCdbHistory() {
  if (!canUseLocalStorage()) return;

  try {
    const raw = window.localStorage.getItem(RECENT_CDB_HISTORY_KEY);
    recentCdbHistory.set(normalizeRecentCdbHistory(raw ? JSON.parse(raw) : []));
  } catch {
    recentCdbHistory.set([]);
  }
}

export function removeRecentCdbHistoryEntry(path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath) return;

  recentCdbHistory.update((current) => {
    const next = current.filter((item) => item.path !== normalizedPath);
    persistRecentCdbHistory(next);
    return next;
  });
}
