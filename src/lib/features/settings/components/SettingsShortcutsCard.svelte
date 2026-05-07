<script lang="ts">
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    SHORTCUT_DEFINITIONS,
    createDefaultShortcutBindingMap,
    findShortcutConflicts,
    formatShortcutBinding,
    normalizeShortcutBindingMap,
    serializeKeyboardEvent,
    type ShortcutActionId,
    type ShortcutDefinition,
  } from '$lib/features/shortcuts/registry';

  export let title = '';
  export let description = '';
  export let recordLabel = '';
  export let recordingLabel = '';
  export let resetLabel = '';
  export let resetAllLabel = '';
  export let defaultLabel = '';
  export let conflictLabel = '';
  export let pressHint = '';
  export let shortcutBindings: Record<string, string> = {};
  export let onShortcutBindingsChange: (bindings: Record<string, string>) => void = () => {};

  let recordingId: ShortcutActionId | null = null;

  $: normalizedBindings = normalizeShortcutBindingMap(shortcutBindings);
  $: conflicts = findShortcutConflicts(normalizedBindings);
  $: groupedDefinitions = groupDefinitions(SHORTCUT_DEFINITIONS);

  function groupDefinitions(definitions: ShortcutDefinition[]) {
    const groups: Array<{ categoryKey: string; definitions: ShortcutDefinition[] }> = [];
    for (const definition of definitions) {
      const current = groups.at(-1);
      if (current?.categoryKey === definition.categoryKey) {
        current.definitions.push(definition);
      } else {
        groups.push({ categoryKey: definition.categoryKey, definitions: [definition] });
      }
    }
    return groups;
  }

  function updateBinding(actionId: ShortcutActionId, binding: string) {
    onShortcutBindingsChange({
      ...normalizedBindings,
      [actionId]: binding,
    });
  }

  function resetBinding(actionId: ShortcutActionId) {
    const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === actionId);
    if (!definition) return;
    updateBinding(actionId, definition.defaultBinding);
  }

  function resetAllBindings() {
    recordingId = null;
    onShortcutBindingsChange(createDefaultShortcutBindingMap());
  }

  function startRecording(event: MouseEvent, actionId: ShortcutActionId) {
    recordingId = actionId;
    const button = event.currentTarget as HTMLButtonElement;
    void tick().then(() => button.focus());
  }

  function handleRecorderKeydown(event: KeyboardEvent, actionId: ShortcutActionId) {
    if (recordingId !== actionId || event.key === 'Tab') return;

    event.preventDefault();
    event.stopPropagation();
    const binding = serializeKeyboardEvent(event);
    if (!binding) return;
    updateBinding(actionId, binding);
    recordingId = null;
  }

  function getConflictText(definition: ShortcutDefinition) {
    const conflictIds = conflicts.get(definition.id) ?? [];
    if (conflictIds.length === 0) return '';
    const names = conflictIds
      .map((id) => SHORTCUT_DEFINITIONS.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => $_((item as ShortcutDefinition).labelKey))
      .join('、');
    return conflictLabel.replace('{actions}', names);
  }
</script>

<div class="sp-card shortcut-card">
  <div class="shortcut-head">
    <div class="sp-card-head">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <button type="button" class="shortcut-reset-all" onclick={resetAllBindings}>{resetAllLabel}</button>
  </div>

  <p class="shortcut-hint">{pressHint}</p>

  <div class="shortcut-groups">
    {#each groupedDefinitions as group (group.categoryKey)}
      <section class="shortcut-group">
        <h4>{$_(group.categoryKey)}</h4>
        <div class="shortcut-list">
          {#each group.definitions as definition (definition.id)}
            {@const hasConflict = conflicts.has(definition.id)}
            <div class="shortcut-row" class:has-conflict={hasConflict}>
              <div class="shortcut-main">
                <span class="shortcut-name">{$_(definition.labelKey)}</span>
                <span class="shortcut-desc">{$_(definition.descriptionKey)}</span>
                {#if hasConflict}
                  <span class="shortcut-conflict">{getConflictText(definition)}</span>
                {/if}
              </div>
              <div class="shortcut-controls">
                <span class="shortcut-default">{defaultLabel}: {formatShortcutBinding(definition.defaultBinding)}</span>
                <button
                  type="button"
                  class="shortcut-binding"
                  class:recording={recordingId === definition.id}
                  aria-pressed={recordingId === definition.id}
                  title={recordLabel}
                  onclick={(event) => startRecording(event, definition.id)}
                  onkeydown={(event) => handleRecorderKeydown(event, definition.id)}
                >
                  {recordingId === definition.id ? recordingLabel : formatShortcutBinding(normalizedBindings[definition.id])}
                </button>
                <button type="button" class="shortcut-reset" onclick={() => resetBinding(definition.id)}>{resetLabel}</button>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .sp-card {
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sp-card-head h3 {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-card-head p {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .shortcut-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }
  .shortcut-hint {
    margin: 0;
    font-size: 0.72rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }
  .shortcut-reset-all,
  .shortcut-reset,
  .shortcut-binding {
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--bg-base);
    color: var(--text-primary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .shortcut-reset-all,
  .shortcut-reset { padding: 5px 8px; }
  .shortcut-binding {
    min-width: 92px;
    padding: 6px 10px;
    font-family: 'Cascadia Code', Consolas, monospace;
    font-weight: 700;
    text-align: center;
  }
  .shortcut-reset-all:hover,
  .shortcut-reset:hover,
  .shortcut-binding:hover,
  .shortcut-binding:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-base));
  }
  .shortcut-binding.recording {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 14%, transparent);
  }
  .shortcut-groups {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .shortcut-group h4 {
    margin: 0 0 6px;
    color: var(--text-secondary);
    font-size: 0.74rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .shortcut-list {
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
    border-radius: 9px;
    overflow: hidden;
  }
  .shortcut-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 9px 10px;
    background: color-mix(in srgb, var(--bg-base) 60%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--border-color) 65%, transparent);
  }
  .shortcut-row:first-child { border-top: 0; }
  .shortcut-row.has-conflict {
    background: color-mix(in srgb, #ef4444 8%, var(--bg-base));
  }
  .shortcut-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .shortcut-name {
    color: var(--text-primary);
    font-size: 0.8rem;
    font-weight: 650;
  }
  .shortcut-desc {
    color: var(--text-secondary);
    font-size: 0.72rem;
    line-height: 1.35;
  }
  .shortcut-conflict {
    color: #ef4444;
    font-size: 0.72rem;
    font-weight: 600;
  }
  .shortcut-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .shortcut-default {
    color: var(--text-disabled);
    font-size: 0.7rem;
  }

  @media (max-width: 760px) {
    .shortcut-row {
      grid-template-columns: 1fr;
    }
    .shortcut-controls {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
