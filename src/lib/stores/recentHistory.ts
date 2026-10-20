import { writable } from 'svelte/store';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

export interface RecentCdbEntry {
  path: string;
  name: string;
}

export const RECENT_CDB_HISTORY_KEY = 'recent-cdb-history';
export const MAX_RECENT_CDB_HISTORY = 20;

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
    const identity = getCdbPathIdentity(path);
    if (!path || seenPaths.has(identity)) continue;

    const name = typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : path.split(/[/\\]/).pop() || path;

    seenPaths.add(identity);
    entries.push({ path, name });

    if (entries.length >= MAX_RECENT_CDB_HISTORY) {
      break;
    }
  }

  return entries;
}

function persistRecentCdbHistory(entries: RecentCdbEntry[]) {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(RECENT_CDB_HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Recent history is optional; storage failures must not break opening files.
  }
}

export function pushRecentCdbEntry(entry: RecentCdbEntry) {
  recentCdbHistory.update((current) => {
    const identity = getCdbPathIdentity(entry.path);
    const next = [
      entry,
      ...current.filter((item) => getCdbPathIdentity(item.path) !== identity),
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

  const identity = getCdbPathIdentity(normalizedPath);
  recentCdbHistory.update((current) => {
    const next = current.filter((item) => getCdbPathIdentity(item.path) !== identity);
    persistRecentCdbHistory(next);
    return next;
  });
}
