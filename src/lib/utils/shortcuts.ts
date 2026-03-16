export const APP_SHORTCUT_EVENT = 'app-shortcut';

export type AppShortcutCommand = 'focus-search' | 'new-card';

export function dispatchAppShortcut(command: AppShortcutCommand) {
  window.dispatchEvent(new CustomEvent<AppShortcutCommand>(APP_SHORTCUT_EVENT, { detail: command }));
}
