import { writable } from 'svelte/store';

export const scriptLocationRequest = writable<{
  tabId: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} | null>(null);
