import type { CardDataEntry, ScriptWorkspaceState } from '$lib/types';

export type LuaWorkbenchContext = {
  activeScript: ScriptWorkspaceState | null;
  card: CardDataEntry | null;
  databaseDocuments: Array<{ id: string; path: string }>;
  t(key: string, options?: Record<string, unknown>): string;
};
