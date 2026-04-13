export {
  ATTRIBUTE_OPTIONS,
  getCardTypeKey,
  LINK_MARKERS,
  PERMISSION_OPTIONS,
  RACE_OPTIONS,
  TYPE_BITS,
} from '$lib/domain/card/taxonomy';
export {
  cloneEditableCard,
  createEmptyCard,
  formatEditableStatValue,
  parseEditableStatInput,
} from '$lib/domain/card/draft';

export function getPackedLScale(level: number): number {
  return (level >> 24) & 0xff;
}

export function getPackedRScale(level: number): number {
  return (level >> 16) & 0xff;
}

export function getPackedLevel(level: number): number {
  return level & 0xff;
}

export function setPackedLevel(level: number, lscale: number, rscale: number): number {
  return (level & 0xff) | ((rscale & 0xff) << 16) | ((lscale & 0xff) << 24);
}
