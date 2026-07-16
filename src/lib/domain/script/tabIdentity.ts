import type { ScriptWorkspaceState } from '$lib/types';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

export const isSameCdbPath = (left: string, right: string) => (
  getCdbPathIdentity(left) === getCdbPathIdentity(right)
);

export const getScriptTabKey = (cdbPath: string, cardCode: number) => (
  `${getCdbPathIdentity(cdbPath)}::${cardCode}`
);

type ScriptTabIdentity = Pick<ScriptWorkspaceState, 'cdbPath' | 'cardCode'>
  & Partial<Pick<ScriptWorkspaceState, 'sourceTabId'>>;

export const findScriptTabByCard = <T extends ScriptTabIdentity>(
  tabs: T[],
  cdbPath: string,
  cardCode: number,
  sourceTabId?: string | null,
) => {
  if (sourceTabId) {
    const sourceMatch = tabs.find((tab) => tab.sourceTabId === sourceTabId && tab.cardCode === cardCode);
    if (sourceMatch) return sourceMatch;
  }
  return tabs.find((tab) => getScriptTabKey(tab.cdbPath, tab.cardCode) === getScriptTabKey(cdbPath, cardCode)) ?? null;
};

export const isScriptTabOwnedByCdb = (
  tab: Pick<ScriptWorkspaceState, 'sourceTabId' | 'cdbPath'>,
  cdb: { tabId: string; path: string },
) => tab.sourceTabId === cdb.tabId || isSameCdbPath(tab.cdbPath, cdb.path);
