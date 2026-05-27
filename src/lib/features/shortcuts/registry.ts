export type ShortcutScope = 'global' | 'cardEditor' | 'search' | 'pagination' | 'scriptEditor';

export type ShortcutActionId =
  | 'global.openDatabase'
  | 'global.createDatabase'
  | 'global.saveWorkspace'
  | 'global.focusSearchF3'
  | 'global.focusSearchPrimaryF'
  | 'global.focusSearchPrimaryG'
  | 'global.undoLastOperation'
  | 'global.newCard'
  | 'global.copySelection'
  | 'global.pasteSelection'
  | 'global.deleteSelection'
  | 'cardEditor.undoDraft'
  | 'cardEditor.modify'
  | 'cardEditor.selectPrevious'
  | 'cardEditor.selectNext'
  | 'cardEditor.selectPreviousGlobal'
  | 'cardEditor.selectNextGlobal'
  | 'cardEditor.pagePrevious'
  | 'cardEditor.pageNext'
  | 'cardEditor.dismissOverlay'
  | 'search.runSearch'
  | 'pagination.jumpPage'
  | 'scriptEditor.openConstants'
  | 'scriptEditor.openFunctions'
  | 'scriptEditor.closeReference'
  | 'scriptEditor.closeTab';

export type ShortcutBinding = {
  key: string;
  primary?: boolean;
  alt?: boolean;
  shift?: boolean;
};

export type ShortcutDefinition = {
  id: ShortcutActionId;
  scope: ShortcutScope;
  categoryKey: string;
  labelKey: string;
  descriptionKey: string;
  defaultBinding: string;
};

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'global.openDatabase',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_open_database',
    descriptionKey: 'settings.shortcut_open_database_desc',
    defaultBinding: 'Primary+O',
  },
  {
    id: 'global.createDatabase',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_create_database',
    descriptionKey: 'settings.shortcut_create_database_desc',
    defaultBinding: 'Primary+N',
  },
  {
    id: 'global.saveWorkspace',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_save_workspace',
    descriptionKey: 'settings.shortcut_save_workspace_desc',
    defaultBinding: 'Primary+S',
  },
  {
    id: 'global.focusSearchF3',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_focus_search_f3',
    descriptionKey: 'settings.shortcut_focus_search_desc',
    defaultBinding: 'F3',
  },
  {
    id: 'global.focusSearchPrimaryF',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_focus_search_primary_f',
    descriptionKey: 'settings.shortcut_focus_search_desc',
    defaultBinding: 'Primary+F',
  },
  {
    id: 'global.focusSearchPrimaryG',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_focus_search_primary_g',
    descriptionKey: 'settings.shortcut_focus_search_desc',
    defaultBinding: 'Primary+G',
  },
  {
    id: 'global.undoLastOperation',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_undo_last_operation',
    descriptionKey: 'settings.shortcut_undo_last_operation_desc',
    defaultBinding: 'Primary+Z',
  },
  {
    id: 'global.newCard',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_new_card',
    descriptionKey: 'settings.shortcut_new_card_desc',
    defaultBinding: 'Primary+Shift+N',
  },
  {
    id: 'global.copySelection',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_copy_selection',
    descriptionKey: 'settings.shortcut_copy_selection_desc',
    defaultBinding: 'Primary+C',
  },
  {
    id: 'global.pasteSelection',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_paste_selection',
    descriptionKey: 'settings.shortcut_paste_selection_desc',
    defaultBinding: 'Primary+V',
  },
  {
    id: 'global.deleteSelection',
    scope: 'global',
    categoryKey: 'settings.shortcuts_category_global',
    labelKey: 'settings.shortcut_delete_selection',
    descriptionKey: 'settings.shortcut_delete_selection_desc',
    defaultBinding: 'Primary+D',
  },
  {
    id: 'cardEditor.undoDraft',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_undo_draft',
    descriptionKey: 'settings.shortcut_undo_draft_desc',
    defaultBinding: 'Primary+Z',
  },
  {
    id: 'cardEditor.modify',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_modify_card',
    descriptionKey: 'settings.shortcut_modify_card_desc',
    defaultBinding: 'Primary+Enter',
  },
  {
    id: 'cardEditor.selectPrevious',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_select_previous_card',
    descriptionKey: 'settings.shortcut_select_previous_card_desc',
    defaultBinding: 'ArrowUp',
  },
  {
    id: 'cardEditor.selectNext',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_select_next_card',
    descriptionKey: 'settings.shortcut_select_next_card_desc',
    defaultBinding: 'ArrowDown',
  },
  {
    id: 'cardEditor.selectPreviousGlobal',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_select_previous_card_global',
    descriptionKey: 'settings.shortcut_select_previous_card_global_desc',
    defaultBinding: 'Primary+ArrowUp',
  },
  {
    id: 'cardEditor.selectNextGlobal',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_select_next_card_global',
    descriptionKey: 'settings.shortcut_select_next_card_global_desc',
    defaultBinding: 'Primary+ArrowDown',
  },
  {
    id: 'cardEditor.pagePrevious',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_previous_page',
    descriptionKey: 'settings.shortcut_previous_page_desc',
    defaultBinding: 'ArrowLeft',
  },
  {
    id: 'cardEditor.pageNext',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_next_page',
    descriptionKey: 'settings.shortcut_next_page_desc',
    defaultBinding: 'ArrowRight',
  },
  {
    id: 'cardEditor.dismissOverlay',
    scope: 'cardEditor',
    categoryKey: 'settings.shortcuts_category_card_editor',
    labelKey: 'settings.shortcut_dismiss_overlay',
    descriptionKey: 'settings.shortcut_dismiss_overlay_desc',
    defaultBinding: 'Escape',
  },
  {
    id: 'search.runSearch',
    scope: 'search',
    categoryKey: 'settings.shortcuts_category_search',
    labelKey: 'settings.shortcut_run_search',
    descriptionKey: 'settings.shortcut_run_search_desc',
    defaultBinding: 'Enter',
  },
  {
    id: 'pagination.jumpPage',
    scope: 'pagination',
    categoryKey: 'settings.shortcuts_category_search',
    labelKey: 'settings.shortcut_jump_page',
    descriptionKey: 'settings.shortcut_jump_page_desc',
    defaultBinding: 'Enter',
  },
  {
    id: 'scriptEditor.openConstants',
    scope: 'scriptEditor',
    categoryKey: 'settings.shortcuts_category_script_editor',
    labelKey: 'settings.shortcut_open_constants',
    descriptionKey: 'settings.shortcut_open_constants_desc',
    defaultBinding: 'F9',
  },
  {
    id: 'scriptEditor.openFunctions',
    scope: 'scriptEditor',
    categoryKey: 'settings.shortcuts_category_script_editor',
    labelKey: 'settings.shortcut_open_functions',
    descriptionKey: 'settings.shortcut_open_functions_desc',
    defaultBinding: 'F10',
  },
  {
    id: 'scriptEditor.closeReference',
    scope: 'scriptEditor',
    categoryKey: 'settings.shortcuts_category_script_editor',
    labelKey: 'settings.shortcut_close_reference',
    descriptionKey: 'settings.shortcut_close_reference_desc',
    defaultBinding: 'Escape',
  },
  {
    id: 'scriptEditor.closeTab',
    scope: 'scriptEditor',
    categoryKey: 'settings.shortcuts_category_script_editor',
    labelKey: 'settings.shortcut_close_script_tab',
    descriptionKey: 'settings.shortcut_close_script_tab_desc',
    defaultBinding: 'Primary+Delete',
  },
];

export const SHORTCUT_ACTION_IDS = SHORTCUT_DEFINITIONS.map((item) => item.id);

const MODIFIER_ONLY_KEYS = new Set([
  'Alt',
  'AltGraph',
  'Control',
  'Meta',
  'Shift',
]);

function canonicalKey(key: string) {
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  const namedKeys: Record<string, string> = {
    esc: 'Escape',
    escape: 'Escape',
    space: 'Space',
    ' ': 'Space',
    del: 'Delete',
    delete: 'Delete',
    enter: 'Enter',
    return: 'Enter',
    arrowup: 'ArrowUp',
    up: 'ArrowUp',
    arrowdown: 'ArrowDown',
    down: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    left: 'ArrowLeft',
    arrowright: 'ArrowRight',
    right: 'ArrowRight',
    tab: 'Tab',
    backspace: 'Backspace',
  };

  if (namedKeys[lower]) return namedKeys[lower];
  if (/^f\d{1,2}$/i.test(trimmed)) return trimmed.toUpperCase();
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed;
}

function bindingToSpec(binding: ShortcutBinding) {
  const parts: string[] = [];
  if (binding.primary) parts.push('Primary');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  parts.push(canonicalKey(binding.key));
  return parts.join('+');
}

export function normalizeShortcutBindingInput(value: string | null | undefined) {
  const binding = parseShortcutBinding(value);
  return binding ? bindingToSpec(binding) : '';
}

export function parseShortcutBinding(value: string | null | undefined): ShortcutBinding | null {
  const parts = String(value ?? '')
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const binding: ShortcutBinding = { key: '' };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'primary' || lower === 'cmdorctrl' || lower === 'ctrlcmd') {
      binding.primary = true;
      continue;
    }
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmd' || lower === 'command' || lower === 'meta') {
      binding.primary = true;
      continue;
    }
    if (lower === 'alt' || lower === 'option') {
      binding.alt = true;
      continue;
    }
    if (lower === 'shift') {
      binding.shift = true;
      continue;
    }
    binding.key = canonicalKey(part);
  }

  if (!binding.key || MODIFIER_ONLY_KEYS.has(binding.key)) return null;
  return binding;
}

export function createDefaultShortcutBindingMap() {
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition.defaultBinding]),
  ) as Record<ShortcutActionId, string>;
}

export function normalizeShortcutBindingMap(value: Partial<Record<string, string>> | null | undefined) {
  const defaults = createDefaultShortcutBindingMap();
  const normalized = { ...defaults };
  for (const definition of SHORTCUT_DEFINITIONS) {
    const input = value?.[definition.id];
    const next = normalizeShortcutBindingInput(input);
    normalized[definition.id] = next || definition.defaultBinding;
  }
  return normalized;
}

export function serializeKeyboardEvent(event: KeyboardEvent) {
  if (MODIFIER_ONLY_KEYS.has(event.key)) return '';
  return bindingToSpec({
    key: event.key === ' ' ? 'Space' : event.key,
    primary: event.ctrlKey || event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  });
}

export function formatShortcutBinding(
  value: string | null | undefined,
  platform = typeof navigator === 'undefined' ? '' : navigator.platform,
) {
  const binding = parseShortcutBinding(value);
  if (!binding) return '';
  const parts: string[] = [];
  if (binding.primary) parts.push(/Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl');
  if (binding.alt) parts.push(/Mac|iPhone|iPad|iPod/i.test(platform) ? '⌥' : 'Alt');
  if (binding.shift) parts.push(/Mac|iPhone|iPad|iPod/i.test(platform) ? '⇧' : 'Shift');
  const keyLabels: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Escape: 'Esc',
  };
  parts.push(keyLabels[binding.key] ?? binding.key);
  return parts.join(/Mac|iPhone|iPad|iPod/i.test(platform) ? '' : '+');
}

function scopeOverlaps(left: ShortcutScope, right: ShortcutScope) {
  return left === right;
}

export function findShortcutConflicts(bindings: Partial<Record<string, string>>) {
  const normalized = normalizeShortcutBindingMap(bindings);
  const conflicts = new Map<ShortcutActionId, ShortcutActionId[]>();

  for (let leftIndex = 0; leftIndex < SHORTCUT_DEFINITIONS.length; leftIndex += 1) {
    const left = SHORTCUT_DEFINITIONS[leftIndex];
    const leftBinding = normalized[left.id];
    for (let rightIndex = leftIndex + 1; rightIndex < SHORTCUT_DEFINITIONS.length; rightIndex += 1) {
      const right = SHORTCUT_DEFINITIONS[rightIndex];
      if (!scopeOverlaps(left.scope, right.scope) || leftBinding !== normalized[right.id]) {
        continue;
      }
      conflicts.set(left.id, [...(conflicts.get(left.id) ?? []), right.id]);
      conflicts.set(right.id, [...(conflicts.get(right.id) ?? []), left.id]);
    }
  }

  return conflicts;
}

export function hasShortcutConflicts(bindings: Partial<Record<string, string>>) {
  return findShortcutConflicts(bindings).size > 0;
}

export function isShortcutEvent(
  actionId: ShortcutActionId,
  event: KeyboardEvent,
  bindings: Partial<Record<string, string>>,
) {
  const binding = parseShortcutBinding(normalizeShortcutBindingMap(bindings)[actionId]);
  if (!binding) return false;

  const primaryPressed = event.ctrlKey || event.metaKey;
  return canonicalKey(event.key === ' ' ? 'Space' : event.key) === binding.key
    && primaryPressed === Boolean(binding.primary)
    && event.altKey === Boolean(binding.alt)
    && event.shiftKey === Boolean(binding.shift);
}
