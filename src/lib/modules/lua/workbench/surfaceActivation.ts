import { get } from 'svelte/store';
import { activeTab } from '#lib/stores/db.ts';
import { activeScriptTab } from '#lib/stores/scriptEditor.svelte.ts';
import { activateEditorView, activateScriptView } from '#lib/stores/appShell.svelte.ts';
import { isScriptTabOwnedByCdb } from '#lib/domain/script/tabIdentity.ts';

/** Lua surface activation: show the script view only when it owns a tab. */
export function activateLuaCardSurface() {
  const tab = get(activeTab);
  const script = get(activeScriptTab);
  if (tab && script && isScriptTabOwnedByCdb(script, { tabId: tab.id, path: tab.path })) {
    activateScriptView();
    return;
  }
  activateEditorView();
}
