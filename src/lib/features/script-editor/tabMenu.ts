import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { ScriptWorkspaceState } from '$lib/types';
import { activeTabId } from '$lib/stores/db';
import { scriptTabs } from '$lib/stores/scriptEditor.svelte';
import { navigateToCard } from '$lib/features/card-editor/cardNavigation';
import { openContextMenu, type ContextMenuItem } from '$lib/features/context-menu/menu.svelte';
import { openScriptExternallyFlow, reloadScriptEditorFlow, saveScriptEditorFlow } from './useCases';

export function openScriptTabMenu(event: MouseEvent, input: {
  tab: ScriptWorkspaceState;
  tabs: ScriptWorkspaceState[];
  activeId: string | null;
  onSplit: (tabId: string) => void;
  onClose: (tabId: string) => Promise<boolean>;
}) {
  const tabId = input.tab.id;
  const ownerId = get(activeTabId);
  const t = (key: string, options?: Record<string, unknown>) => String(get(_)(key, options as never));
  const label = (key: string) => t(`context_menu.${key}`);
  const run = (action: (tab: ScriptWorkspaceState) => unknown | Promise<unknown>) => async () => {
    const tab = get(scriptTabs).find((item) => item.id === tabId);
    if (tab && get(activeTabId) === ownerId) await action(tab);
  };
  const items: ContextMenuItem[] = [
    { id: 'save', label: label('save_script'), action: run((tab) => saveScriptEditorFlow({ tab, isSaving: false, t })) },
    { id: 'reload', label: label('reload_script'), action: run((tab) => reloadScriptEditorFlow({ tab, isReloading: false, t })) },
    { id: 'external', label: label('external_editor'), action: run((tab) => openScriptExternallyFlow({ tab, t })) },
    { id: 'copy-path', label: label('copy_path'), action: run((tab) => navigator.clipboard.writeText(tab.scriptPath)) }, null,
    { id: 'card', label: label('edit_card'), action: run((tab) => ownerId && navigateToCard(ownerId, tab.cardCode, 'card')) },
    ...(input.activeId && input.activeId !== tabId ? [{ id: 'split', label: label('split_script'), action: run(() => input.onSplit(tabId)) }] : []), null,
    { id: 'close-others', label: label('close_other_scripts'), disabled: input.tabs.length < 2, action: run(async () => {
      for (const other of input.tabs) {
        if (get(activeTabId) !== ownerId) break;
        if (other.id !== tabId && !(await input.onClose(other.id))) break;
      }
    }) },
  ];
  openContextMenu(event, items);
}
