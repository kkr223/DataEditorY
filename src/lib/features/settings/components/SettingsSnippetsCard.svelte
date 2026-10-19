<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { disableAutofill } from '$lib/actions/disableAutofill';
  import {
    getScriptSnippetIssue, readScriptSnippetEntries, serializeScriptSnippetEntries,
    type ScriptSnippetEntry,
  } from '$lib/features/script-editor/snippetPreferences';

  let { value, onChange }: { value: string; onChange: (value: string) => void } = $props();
  let selectedIndex = $state(0);
  let search = $state('');
  let renameError = $state(false);
  const entries = $derived.by(() => {
    try { return readScriptSnippetEntries(value); } catch { return []; }
  });
  const selected = $derived(entries[selectedIndex]);
  const issue = $derived(getScriptSnippetIssue(value));
  const filtered = $derived(entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => (
    `${entry.name} ${entry.prefix} ${entry.description}`.toLowerCase().includes(search.toLowerCase())
  )));

  function updateEntry(patch: Partial<ScriptSnippetEntry>) {
    onChange(serializeScriptSnippetEntries(entries.map((entry, index) => index === selectedIndex ? { ...entry, ...patch } : entry)));
  }
  function rename(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const name = input.value.trim();
    renameError = !name || entries.some((entry, index) => index !== selectedIndex && entry.name === name);
    if (renameError) { input.value = selected?.name ?? ''; return; }
    updateEntry({ name });
  }
  function addEntry() {
    let number = 1;
    while (entries.some((entry) => entry.name === `snippet${number}` || entry.prefix.toLowerCase() === `#snippet${number}`)) number += 1;
    const next = [...entries, { name: `snippet${number}`, prefix: `#snippet${number}`, description: '', body: '-- ${1:code}\n$0' }];
    search = '';
    renameError = false;
    selectedIndex = next.length - 1;
    onChange(serializeScriptSnippetEntries(next));
  }
  function removeEntry() {
    const next = entries.filter((_entry, index) => index !== selectedIndex);
    selectedIndex = Math.max(0, selectedIndex - 1);
    renameError = false;
    onChange(serializeScriptSnippetEntries(next));
  }
</script>

<section class="snippets-card" use:disableAutofill>
  <header>
    <div><h3>{$_('settings.snippets_title')}</h3><p>{$_('settings.snippets_description')}</p></div>
    <button type="button" class="add-button" onclick={addEntry}>{$_('settings.snippets_add')}</button>
  </header>
  <p class="storage-hint">{$_('settings.snippets_storage_hint')}</p>
  {#if issue || renameError}
    <p class="error" role="alert">{$_(`settings.snippets_error_${renameError ? 'name' : issue}`)}</p>
  {/if}
  <div class="snippet-workspace">
    <nav aria-label={$_('settings.snippets_title')}>
      <input type="search" value={search} oninput={(event) => { search = event.currentTarget.value; }}
        aria-label={$_('settings.snippets_search')} placeholder={$_('settings.snippets_search')} />
      <div class="snippet-list">
        {#each filtered as { entry, index } (index)}
          <button type="button" class:active={index === selectedIndex} aria-pressed={index === selectedIndex}
            onclick={() => { selectedIndex = index; renameError = false; }}>
            <code>{entry.prefix || '…'}</code><span>{entry.name}</span>
          </button>
        {/each}
        {#if !filtered.length}<p class="empty">{$_('settings.snippets_empty')}</p>{/if}
      </div>
    </nav>
    {#if selected}
      <div class="snippet-fields">
        <div class="field-row">
          <label><span>{$_('settings.snippets_name')}</span><input value={selected.name} onchange={rename} /></label>
          <label><span>{$_('settings.snippets_prefix')}</span><input value={selected.prefix}
            oninput={(event) => updateEntry({ prefix: event.currentTarget.value })} spellcheck="false" /></label>
          <button type="button" class="remove-button" onclick={removeEntry}>{$_('settings.snippets_remove')}</button>
        </div>
        <label><span>{$_('settings.snippets_description_label')}</span><input value={selected.description}
          oninput={(event) => updateEntry({ description: event.currentTarget.value })} /></label>
        <label class="body-field"><span>{$_('settings.snippets_body')}</span><textarea value={selected.body}
          spellcheck="false" oninput={(event) => updateEntry({ body: event.currentTarget.value })}></textarea></label>
        <small>{$_('settings.snippets_placeholder_hint')}</small>
      </div>
    {:else}
      <div class="empty-editor">{$_('settings.snippets_empty_editor')}</div>
    {/if}
  </div>
</section>

<style>
  .snippets-card { padding: 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-surface); }
  header, .field-row { display: flex; align-items: end; gap: 12px; }
  header { align-items: start; justify-content: space-between; }
  h3 { margin: 0; color: var(--text-primary); font-size: 0.95rem; }
  p, small { color: var(--text-secondary); font-size: 0.8rem; line-height: 1.5; }
  header p { margin: 4px 0 0; }
  .storage-hint { padding: 8px 10px; border-left: 2px solid var(--accent-primary); background: var(--bg-base); }
  .snippet-workspace { display: grid; grid-template-columns: minmax(160px, 220px) minmax(0, 1fr); min-height: 420px; gap: 16px; }
  nav, .snippet-fields, label { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .snippet-list { max-height: 440px; overflow: auto; display: flex; flex-direction: column; gap: 3px; }
  button { cursor: pointer; font: inherit; border-radius: var(--control-radius); padding: 7px 10px; border: 1px solid var(--border-color); }
  .snippet-list button { display: flex; flex-direction: column; align-items: start; gap: 3px; border-color: transparent; background: transparent; color: var(--text-secondary); text-align: left; }
  .snippet-list button.active { background: var(--interactive-soft-bg); border-color: var(--interactive-soft-border); color: var(--text-primary); }
  .snippet-list button:hover { background: var(--bg-surface-hover); }
  .snippet-list span { font-size: 0.73rem; overflow-wrap: anywhere; }
  code { font-size: 0.85rem; overflow-wrap: anywhere; }
  label { flex: 1; font-size: 0.78rem; color: var(--text-secondary); }
  input, textarea { width: 100%; min-width: 0; border: 1px solid var(--border-color); border-radius: var(--control-radius); padding: 8px 10px; background: var(--bg-base); color: var(--text-primary); font: inherit; }
  input:focus-visible, textarea:focus-visible, button:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
  .body-field { flex: 1; }
  textarea { flex: 1; min-height: 280px; resize: vertical; font-family: 'Cascadia Code', Consolas, monospace; font-size: 0.85rem; line-height: 1.6; tab-size: 4; white-space: pre; }
  .add-button { background: var(--accent-primary); color: white; flex-shrink: 0; }
  .remove-button { background: var(--state-danger-bg); color: var(--state-danger-text); flex-shrink: 0; }
  .error { color: var(--state-danger-text); }
  .empty { padding: 10px; }
  .empty-editor { display: grid; place-items: center; color: var(--text-secondary); }
  @media (max-width: 800px) { .snippet-workspace { grid-template-columns: 1fr; } .snippet-list { max-height: 140px; } .field-row { flex-wrap: wrap; } }
</style>
