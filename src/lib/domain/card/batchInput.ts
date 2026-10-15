import type { CardDataEntry } from '$lib/types';

export type BatchEditableField = Exclude<keyof CardDataEntry, 'code' | 'strings'>;

export function parseBatchInput(field: BatchEditableField, input: string): string | number | number[] {
  if (field === 'name' || field === 'desc') return input;
  const value = input.trim();
  if (field === 'setcode') {
    if (!value) return [];
    const parts = value.split(/[,，\s]+/).filter(Boolean);
    if (parts.length > 4 || parts.some((part) => !/^(?:0x)?[\da-f]{1,4}$/i.test(part))) {
      throw new Error('setcode');
    }
    return parts.map((part) => parseInt(part.replace(/^0x/i, ''), 16)).filter(Boolean);
  }
  if (!value) return 0;
  if ((field === 'attack' || field === 'defense') && /^[?？]$/.test(value)) return -2;
  if (!/^(?:-?\d+|0x[\da-f]+)$/i.test(value)) throw new Error('number');
  const number = Number(value);
  const signed = field === 'attack' || field === 'defense';
  const max = signed ? 0x7fffffff : field === 'category' ? Number.MAX_SAFE_INTEGER : 0xffffffff;
  if (!Number.isSafeInteger(number) || number < (signed ? -2 : 0) || number > max) throw new Error('number');
  if ((field === 'lscale' || field === 'rscale') && number > 13) throw new Error('scale');
  if (field === 'level' && number > 255) throw new Error('level');
  if (field === 'linkMarker' && (number & ~0x1ef)) throw new Error('linkMarker');
  return number;
}

export function formatBatchValue(field: BatchEditableField, value: CardDataEntry[BatchEditableField]) {
  if (field === 'setcode') return (value as number[]).filter(Boolean).map((item) => `0x${item.toString(16).toUpperCase().padStart(4, '0')}`).join(', ') || '—';
  if (field === 'level') return String(Number(value) & 0xff);
  if ((field === 'attack' || field === 'defense') && Number(value) < 0) return '?';
  return value === '' ? '—' : String(value);
}
