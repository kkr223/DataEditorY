import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { openContextMenu, type ContextMenuItem } from './menu.svelte';

export function handleTextContextMenu(event: MouseEvent) {
  if (event.defaultPrevented) return;
  const element = event.target instanceof Element ? event.target : null;
  // Monaco owns its selection and menu. Never replace it with the form menu.
  if (element?.closest('.monaco-editor')) return;
  const input = element?.closest('input, textarea, [contenteditable="true"]');
  event.preventDefault();
  if (!(input instanceof HTMLElement)) return;
  const field = input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement ? input : null;
  if (field?.disabled || (field instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'color'].includes(field.type))) return;
  const start = field?.selectionStart ?? null;
  const end = field?.selectionEnd ?? null;
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  const selectedText = field ? start === null ? String(selection ?? '') : field.value.slice(start, end ?? start) : String(selection ?? '');
  const readonly = Boolean(field?.readOnly);
  const restore = () => {
    input.focus({ preventScroll: true });
    if (field && start !== null && end !== null) field.setSelectionRange(start, end);
    // Number inputs keep their selection internally but expose no selectionStart.
    // Restoring a document Range would clear that internal selection.
    else if (!field && range) { selection?.removeAllRanges(); selection?.addRange(range); }
  };
  const command = (name: string, value?: string) => { restore(); document.execCommand(name, false, value); };
  const t = (key: string) => String(get(_)(`context_menu.${key}`));
  const items: ContextMenuItem[] = [
    { id: 'undo', label: t('undo'), shortcut: 'Ctrl+Z', disabled: readonly, action: () => command('undo') },
    { id: 'redo', label: t('redo'), shortcut: 'Ctrl+Y', disabled: readonly, action: () => command('redo') }, null,
    { id: 'cut', label: t('cut'), shortcut: 'Ctrl+X', disabled: readonly || !selectedText, action: async () => { await navigator.clipboard.writeText(selectedText); command('delete'); } },
    { id: 'copy', label: t('copy'), shortcut: 'Ctrl+C', disabled: !selectedText, action: () => navigator.clipboard.writeText(selectedText) },
    { id: 'paste', label: t('paste'), shortcut: 'Ctrl+V', disabled: readonly, action: async () => command('insertText', await navigator.clipboard.readText()) },
    { id: 'delete', label: t('delete_text'), disabled: readonly || !selectedText, action: () => command('delete') }, null,
    { id: 'select-all', label: t('select_all'), shortcut: 'Ctrl+A', action: () => { restore(); if (field) field.select(); else document.execCommand('selectAll'); } },
  ];
  openContextMenu(event, items);
}
