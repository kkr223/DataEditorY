import { invoke } from '@tauri-apps/api/core';
import type { SelectOption } from '$lib/types';

export function getSetcode(setcode: number[], index: number): string;
export function getSetcode(setcode: bigint | number, index: number): string;
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

export function updateSetcode(setcode: number[], index: number, hexValue: string): number[];
export function updateSetcode(setcode: bigint | number, index: number, hexValue: string): bigint;
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

export type SetcodeOption = SelectOption<string> & { label: string };

function parseStringsConf(content: string): SetcodeOption[] {
  const result: SetcodeOption[] = [];
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

let popularSetcodesPromise: Promise<SetcodeOption[]> | null = null;

async function loadStringsConfContent(): Promise<string> {
  try {
    return await invoke<string>('load_strings_conf');
  } catch {
    const response = await fetch('/strings.conf');
    if (!response.ok) {
      throw new Error(`Failed to load strings.conf: ${response.status}`);
    }
    return response.text();
  }
}

export async function loadPopularSetcodes(): Promise<SetcodeOption[]> {
  if (!popularSetcodesPromise) {
    popularSetcodesPromise = loadStringsConfContent()
      .then((content) => parseStringsConf(content))
      .catch((error) => {
        console.error('Failed to load strings.conf', error);
        return [];
      });
  }

  return popularSetcodesPromise;
}
