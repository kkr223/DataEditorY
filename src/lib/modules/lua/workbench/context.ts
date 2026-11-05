import type { CardDataEntry, ScriptWorkspaceState } from '#lib/types/index.ts';

export type LuaWorkbenchContext = {
  activeScript: ScriptWorkspaceState | null;
  card: CardDataEntry | null;
  databaseDocuments: Array<{ id: string; path: string }>;
  t(key: string, options?: Record<string, unknown>): string;
};
