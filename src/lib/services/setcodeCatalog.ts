import type { SelectOption } from '$lib/types';
import { loadStringsConfContent } from '$lib/infrastructure/tauri/commands';

export type SetcodeOption = SelectOption<string> & { label: string };
export type SetcodeCatalogLoadResult = {
  options: SetcodeOption[];
  duplicateSetcodes: string[];
};

type StringsCatalogIndex = {
  files?: string[];
};

const FALLBACK_STRINGS_FILES = ['base.conf'];

function normalizeSetcodeHex(raw: string) {
  const normalized = raw.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return `0x${normalized.padStart(4, '0').toUpperCase()}`;
}

export function parseStringsCatalogWithDiagnostics(content: string): SetcodeCatalogLoadResult {
  const result = new Map<string, SetcodeOption>();
  const duplicateSetcodes = new Set<string>();
  if (!content) {
    return {
      options: [],
      duplicateSetcodes: [],
    };
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('!setname')) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;

    const hex = normalizeSetcodeHex(parts[1]);
    if (!hex) continue;
    const label = parts.slice(2).join(' ').trim();
    if (!label) continue;

    // strings.conf allows repeated setcode definitions; the later entry overrides the earlier one.
    if (result.has(hex)) {
      duplicateSetcodes.add(hex);
      result.delete(hex);
    }
    result.set(hex, {
      value: hex,
      label,
    });
  }

  return {
    options: Array.from(result.values()),
    duplicateSetcodes: Array.from(duplicateSetcodes.values()),
  };
}

export function parseStringsCatalog(content: string): SetcodeOption[] {
  return parseStringsCatalogWithDiagnostics(content).options;
}

let popularSetcodesPromise: Promise<SetcodeCatalogLoadResult> | null = null;

async function readStringsConf() {
  try {
    return await loadStringsConfContent();
  } catch {
    let files = FALLBACK_STRINGS_FILES;

    try {
      const manifestResponse = await fetch('/resources/strings/index.json');
      if (manifestResponse.ok) {
        const manifest = (await manifestResponse.json()) as StringsCatalogIndex;
        if (Array.isArray(manifest.files) && manifest.files.length > 0) {
          files = manifest.files.filter((value) => typeof value === 'string' && value.trim().length > 0);
        }
      }
    } catch {
      // Keep the static fallback list when the manifest is unavailable.
    }

    const contents = await Promise.all(
      files.map(async (file) => {
        const normalized = file.replace(/^[/\\]+/, '');
        const response = await fetch(`/resources/strings/${normalized}`);
        if (!response.ok) {
          throw new Error(`Failed to load strings file ${normalized}: ${response.status}`);
        }
        return response.text();
      }),
    );

    return contents.join('\n');
  }
}

export async function loadPopularSetcodes() {
  if (!popularSetcodesPromise) {
    popularSetcodesPromise = readStringsConf()
      .then(parseStringsCatalogWithDiagnostics)
      .catch((error) => {
        console.error('Failed to load strings catalog', error);
        return {
          options: [],
          duplicateSetcodes: [],
        };
      });
  }

  return popularSetcodesPromise;
}
