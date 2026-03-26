import type { SelectOption } from '$lib/types';
import { loadStringsConfContent } from '$lib/infrastructure/tauri/commands';

export type SetcodeOption = SelectOption<string> & { label: string };

function parseStringsConf(content: string): SetcodeOption[] {
  const result: SetcodeOption[] = [];
  if (!content) return result;

  for (const line of content.split('\n')) {
    if (!line.trim().startsWith('!setname')) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;

    let hex = parts[1];
    if (hex.toLowerCase().startsWith('0x')) {
      hex = `0x${hex.substring(2).padStart(4, '0').toUpperCase()}`;
    } else {
      hex = `0x${parseInt(hex, 16).toString(16).padStart(4, '0').toUpperCase()}`;
    }

    result.push({
      value: hex,
      label: parts[2],
    });
  }

  return result;
}

let popularSetcodesPromise: Promise<SetcodeOption[]> | null = null;

async function readStringsConf() {
  try {
    return await loadStringsConfContent();
  } catch {
    const response = await fetch('/resources/strings.conf');
    if (!response.ok) {
      throw new Error(`Failed to load strings.conf: ${response.status}`);
    }
    return response.text();
  }
}

export async function loadPopularSetcodes() {
  if (!popularSetcodesPromise) {
    popularSetcodesPromise = readStringsConf()
      .then(parseStringsConf)
      .catch((error) => {
        console.error('Failed to load strings.conf', error);
        return [];
      });
  }

  return popularSetcodesPromise;
}
