import type { ScriptWorkspaceState } from '$lib/types';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

export const isSameCdbPath = (left: string, right: string) => (
  getCdbPathIdentity(left) === getCdbPathIdentity(right)
);

export const getScriptTabKey = (cdbPath: string, cardCode: number) => (
  `${getCdbPathIdentity(cdbPath)}::${cardCode}`
);

export const isScriptTabOwnedByCdb = (
  tab: Pick<ScriptWorkspaceState, 'sourceTabId' | 'cdbPath'>,
  cdb: { tabId: string; path: string },
) => tab.sourceTabId === cdb.tabId || isSameCdbPath(tab.cdbPath, cdb.path);
