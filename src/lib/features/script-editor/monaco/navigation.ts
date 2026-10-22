import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type * as Monaco from 'monaco-editor';
import { activeScriptTabId, openExistingScriptTab, scriptTabs } from '$lib/stores/scriptEditor.svelte';
import { activeTabId } from '$lib/stores/db';
import { appSettingsState } from '$lib/stores/appSettings.svelte';
import { showToast } from '$lib/stores/toast.svelte';
import { pathExists } from '$lib/native/assetApi';
import { getCardScriptInfo } from '$lib/native/scriptApi';
import { tauriBridge } from '$lib/infrastructure/tauri';
import { findLuaNavigationTarget, getLuaLoadScriptLinks } from '../lua/navigation';
import type { LuaSemanticDocument } from '../lua/semantic';
import { createScriptNavigation } from '../scriptNavigation';

const workspaceNavigation = createScriptNavigation({
  getSource: (uri) => get(scriptTabs).find((tab) => uri === `inmemory://dataeditory/script-${tab.id}.lua`),
  getTabs: () => get(scriptTabs), getActiveOwner: () => get(activeTabId), getActiveScript: () => get(activeScriptTabId),
  getDirectories: () => appSettingsState.values,
  dirname: tauriBridge.dirname, join: tauriBridge.join, exists: pathExists,
  getCardScriptInfo, open: openExistingScriptTab,
});

export function registerLuaNavigation(monaco: typeof Monaco, getDocument: (model: Monaco.editor.ITextModel) => LuaSemanticDocument, navigation = workspaceNavigation) {
  monaco.languages.registerDefinitionProvider('lua', {
    provideDefinition(model, position, cancellation) {
      const target = findLuaNavigationTarget(getDocument(model), position);
      if (target?.kind !== 'function' || cancellation.isCancellationRequested) return null;
      return [{ originSelectionRange: target.origin, uri: model.uri, range: target.target }];
    },
  });
  monaco.languages.registerLinkProvider('lua', {
    provideLinks(model) {
      return { links: getLuaLoadScriptLinks(getDocument(model)).map((link) => ({
        range: link.range,
        url: monaco.Uri.from({ scheme: 'dataeditory-loadscript', path: '/', query: new URLSearchParams({ source: model.uri.toString(), path: link.path }).toString() }),
      })) };
    },
  });
  monaco.editor.registerLinkOpener({
    async open(resource) {
      if (resource.scheme !== 'dataeditory-loadscript') return false;
      const params = new URLSearchParams(resource.query);
      const source = params.get('source');
      const reference = params.get('path');
      if (!source || !reference) return true;
      try {
        if (await navigation.follow(source, reference) === 'missing') showToast(`${get(_)('editor.script_open_failed')}: ${reference}`, 'error');
      } catch (error) {
        showToast(`${get(_)('editor.script_open_failed')}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
      return true;
    },
  });
}
