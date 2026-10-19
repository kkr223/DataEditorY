import type { editor } from 'monaco-editor';

// Models outlive the mounted editor, but never their text tab.
const models = new Map<string, () => void>();

export function registerTextTabModel(
  tabId: string,
  model: editor.ITextModel,
  clearContext: (model: editor.ITextModel) => void,
) {
  disposeTextTabModel(tabId);
  models.set(tabId, () => {
    clearContext(model);
    model.dispose();
  });
}

export function disposeTextTabModel(tabId: string) {
  const dispose = models.get(tabId);
  models.delete(tabId);
  dispose?.();
}
