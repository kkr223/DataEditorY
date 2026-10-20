import { get } from 'svelte/store';
import { _, locale } from 'svelte-i18n';
import type { editor } from 'monaco-editor';

export function attachScriptContextMenu(instance: editor.IStandaloneCodeEditor, copyImage: () => unknown | Promise<unknown>) {
  let actions: Array<{ dispose(): void }> = [];
  const unsubscribe = locale.subscribe(() => {
    actions.forEach((action) => action.dispose());
    const t = (key: string) => String(get(_)(`context_menu.${key}`));
    actions = [
      instance.addAction({ id: 'dataeditory.undo', label: t('undo'), contextMenuGroupId: '0_edit', contextMenuOrder: 1, run: () => instance.trigger('context-menu', 'undo', null) }),
      instance.addAction({ id: 'dataeditory.redo', label: t('redo'), contextMenuGroupId: '0_edit', contextMenuOrder: 2, run: () => instance.trigger('context-menu', 'redo', null) }),
      instance.addAction({ id: 'dataeditory.selectAll', label: t('select_all'), contextMenuGroupId: '9_selection', run: () => instance.trigger('context-menu', 'editor.action.selectAll', null) }),
      instance.addAction({ id: 'dataeditory.copyCodeImage', label: t('copy_code_image'), contextMenuGroupId: '9_selection', contextMenuOrder: 2, precondition: 'editorHasSelection', run: async () => { await copyImage(); } }),
    ];
  });
  return () => { unsubscribe(); actions.forEach((action) => action.dispose()); };
}
