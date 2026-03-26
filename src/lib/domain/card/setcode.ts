export function getSetcode(setcode: number[], index: number): string;
export function getSetcode(setcode: bigint | number, index: number): string;
export function getSetcode(setcode: bigint | number | number[], index: number): string {
  if (Array.isArray(setcode)) {
    const value = setcode[index] ?? 0;
    return value === 0 ? '' : `0x${value.toString(16).padStart(4, '0').toUpperCase()}`;
  }

  const mask = 0xffffn;
  const shift = BigInt(index * 16);
  const value = (BigInt(setcode) >> shift) & mask;
  return value === 0n ? '' : `0x${value.toString(16).padStart(4, '0').toUpperCase()}`;
}

export function normalizeSetcodeHex(value: string) {
  return value.replace(/[^0-9a-f]/gi, '').slice(0, 4).toUpperCase();
}

export function updateSetcode(setcode: number[], index: number, hexValue: string): number[];
export function updateSetcode(setcode: bigint | number, index: number, hexValue: string): bigint;
export function updateSetcode(setcode: bigint | number | number[], index: number, hexValue: string): bigint | number[] {
  let numericValue = 0;
  if (hexValue) {
    const cleanHex = hexValue.toLowerCase().startsWith('0x') ? hexValue.slice(2) : hexValue;
    numericValue = parseInt(cleanHex, 16) || 0;
    numericValue &= 0xffff;
  }

  if (Array.isArray(setcode)) {
    const next = [...setcode];
    while (next.length <= index) next.push(0);
    next[index] = numericValue;
    return next;
  }

  const current = BigInt(setcode);
  const mask = ~(0xffffn << BigInt(index * 16));
  return (current & mask) | (BigInt(numericValue) << BigInt(index * 16));
}
