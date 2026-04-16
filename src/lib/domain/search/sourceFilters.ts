export interface SplitSourceTermsResult {
  ids: number[];
  names: string[];
}

function normalizeSourceName(value: string): string {
  return value.trim();
}

export function parseDeckTextToCardIds(input: string): number[] {
  if (!input.trim()) {
    return [];
  }

  const ids = new Set<number>();
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    const match = line.match(/\d{4,}/);
    if (!match) {
      continue;
    }

    const id = Number.parseInt(match[0], 10);
    if (Number.isSafeInteger(id) && id > 0) {
      ids.add(id);
    }
  }

  return [...ids];
}

export function splitSourceTerms(entries: string[]): SplitSourceTermsResult {
  const ids = new Set<number>();
  const names = new Set<string>();

  for (const entry of entries) {
    const normalized = normalizeSourceName(entry);
    if (!normalized) {
      continue;
    }

    if (/^\d+$/.test(normalized)) {
      const id = Number.parseInt(normalized, 10);
      if (Number.isSafeInteger(id) && id > 0) {
        ids.add(id);
      }
      continue;
    }

    names.add(normalized);
  }

  return {
    ids: [...ids],
    names: [...names],
  };
}
