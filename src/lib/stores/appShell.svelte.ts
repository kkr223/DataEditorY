export type MainView = 'editor' | 'settings';

export const appShellState = $state({
  mainView: 'editor' as MainView,
  settingsOpen: false,
});

export function openSettingsView() {
  appShellState.settingsOpen = true;
  appShellState.mainView = 'settings';
}

export function activateEditorView() {
  appShellState.mainView = 'editor';
}

export function closeSettingsView() {
  appShellState.settingsOpen = false;
  if (appShellState.mainView === 'settings') {
    appShellState.mainView = 'editor';
  }
}
