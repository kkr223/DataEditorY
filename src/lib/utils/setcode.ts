export function getSetcode(setcode: bigint | number | number[], index: number): string {
  // setcode can be an array of up to 4 u16 values, or a packed bigint/number
  if (Array.isArray(setcode)) {
    const val = setcode[index] ?? 0;
    if (val === 0) return '';
    return '0x' + val.toString(16).padStart(4, '0').toUpperCase();
  }
  const mask = 0xFFFFn;
  const shift = BigInt(index * 16);
  const val = (BigInt(setcode) >> shift) & mask;
  if (val === 0n) return '';
  return '0x' + val.toString(16).padStart(4, '0').toUpperCase();
}

export function updateSetcode(setcode: bigint | number | number[], index: number, hexValue: string): bigint | number[] {
  let numVal = 0;
  if (hexValue) {
    const cleanHex = hexValue.toLowerCase().startsWith('0x') ? hexValue.slice(2) : hexValue;
    numVal = parseInt(cleanHex, 16) || 0;
    numVal = numVal & 0xFFFF;
  }

  // If setcode is an array, update in-place and return a new array
  if (Array.isArray(setcode)) {
    const result = [...setcode];
    while (result.length <= index) result.push(0);
    result[index] = numVal;
    return result;
  }

  // Packed bigint path
  const current = BigInt(setcode);
  const mask = ~(0xFFFFn << BigInt(index * 16));
  return (current & mask) | (BigInt(numVal) << BigInt(index * 16));
}

// @ts-ignore
import stringsConf from '../data/strings.conf?raw';

function parseStringsConf(content: string) {
  const result: { value: string; label: string }[] = [];
  if (!content) return result;
  
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('!setname')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        let hex = parts[1];
        if (hex.toLowerCase().startsWith('0x')) {
          hex = '0x' + hex.substring(2).padStart(4, '0').toUpperCase();
        } else {
          hex = '0x' + parseInt(hex, 16).toString(16).padStart(4, '0').toUpperCase();
        }
        let label = parts[2]; // Using the Chinese name
        result.push({ value: hex, label });
      }
    }
  }
  return result;
}

export const POPULAR_SETCODES = parseStringsConf(stringsConf || '');
