import { basename } from '#lib/core/path.ts';
import type { ScriptWorkspaceState } from '#lib/types/index.ts';
import { isSameCdbPath } from '#lib/domain/script/tabIdentity.ts';

type ScriptSource = Pick<ScriptWorkspaceState, 'id' | 'cdbPath' | 'sourceTabId' | 'scriptPath'>;
export type ScriptNavigationDependencies = {
  getSource: (modelUri: string) => ScriptSource | undefined;
  getTabs: () => ScriptSource[];
  getActiveOwner: () => string | null;
  getActiveScript: () => string | null;
  getDirectories: () => { scriptDirectory?: string; ygoproPath?: string };
  dirname: (path: string) => string;
  join: (...parts: string[]) => string;
  exists: (path: string) => Promise<boolean>;
  getCardScriptInfo: (path: string, code: number) => Promise<{ path: string }>;
  open: (input: { cdbPath: string; sourceTabId: string | null; scriptPath: string; cardCode: number; cardName: string; activate: boolean; canActivate: () => boolean }) => Promise<string | null>;
};

export function createScriptNavigation(deps: ScriptNavigationDependencies) {
  const resolve = async (modelUri: string, reference: string): Promise<string | null> => {
    const source = deps.getSource(modelUri);
    if (!source || !reference.trim() || /[\0\r\n]/.test(reference)) return null;
    const name = reference.replaceAll('\\', '/');
    const absolute = /^(?:[a-z]:\/|\/)/i.test(name);
    const { scriptDirectory, ygoproPath } = deps.getDirectories();
    const cdbDirectory = deps.dirname(source.cdbPath);
    const roots = absolute ? [''] : [
      deps.dirname(source.scriptPath), deps.join(cdbDirectory, 'script'),
      scriptDirectory?.trim(),
      ygoproPath?.trim() ? deps.join(/\.exe$/i.test(ygoproPath.trim()) ? deps.dirname(ygoproPath.trim()) : ygoproPath.trim(), 'script') : undefined,
      cdbDirectory,
    ];
    const visited = new Set<string>();
    for (const root of roots) {
      if (root === undefined || (!absolute && !root)) continue;
      const path = absolute ? name : deps.join(root, name);
      if (visited.has(path)) continue;
      visited.add(path);
      const open = deps.getTabs().find((tab) => tab.sourceTabId === source.sourceTabId && isSameCdbPath(tab.scriptPath, path));
      if (open || await deps.exists(path)) return open?.scriptPath ?? path;
    }
    return null;
  };
  const open = async (modelUri: string, path: string) => {
    const source = deps.getSource(modelUri);
    if (!source || !source.sourceTabId || deps.getActiveOwner() !== source.sourceTabId) return false;
    const activeScript = deps.getActiveScript();
    const canActivate = () => deps.getActiveOwner() === source.sourceTabId && deps.getActiveScript() === activeScript;
    const match = basename(path).match(/^c(\d+)\.lua$/i);
    let cardCode = 0;
    if (match) {
      const code = Number(match[1]);
      const info = await deps.getCardScriptInfo(source.cdbPath, code);
      if (isSameCdbPath(info.path, path)) cardCode = code;
    }
    if (!canActivate() || !deps.getSource(modelUri)) return false;
    const id = await deps.open({
      cdbPath: source.cdbPath, sourceTabId: source.sourceTabId,
      scriptPath: path, cardCode, cardName: '', activate: true, canActivate,
    });
    return id !== null;
  };
  const follow = async (modelUri: string, reference: string) => {
    const source = deps.getSource(modelUri);
    const owner = deps.getActiveOwner();
    const script = deps.getActiveScript();
    if (!source || !owner || source.sourceTabId !== owner) return 'cancelled' as const;
    const path = await resolve(modelUri, reference);
    if (deps.getActiveOwner() !== owner || deps.getActiveScript() !== script || !deps.getSource(modelUri)) return 'cancelled' as const;
    if (!path) return 'missing' as const;
    return await open(modelUri, path) ? 'opened' as const : 'cancelled' as const;
  };
  return { resolve, open, follow };
}
