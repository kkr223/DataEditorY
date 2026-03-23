export type MainView = 'editor' | 'settings' | 'script';

export const appShellState = $state({
  mainView: 'editor' as MainView,
  settingsOpen: false,
  settingsReturnView: 'editor' as Exclude<MainView, 'settings'>,
});

export function openSettingsView() {
  if (appShellState.mainView !== 'settings') {
    appShellState.settingsReturnView = appShellState.mainView as Exclude<MainView, 'settings'>;
  }
  appShellState.settingsOpen = true;
  appShellState.mainView = 'settings';
}

export function activateEditorView() {
  appShellState.mainView = 'editor';
}

export function activateScriptView() {
  appShellState.mainView = 'script';
}

export function closeSettingsView() {
  appShellState.settingsOpen = false;
  if (appShellState.mainView === 'settings') {
    appShellState.mainView = appShellState.settingsReturnView;
  }
}
