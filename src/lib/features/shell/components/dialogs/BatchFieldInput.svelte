<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { BatchEditableField } from '$lib/domain/card/batchInput';
  import { ATTRIBUTE_OPTIONS, PERMISSION_OPTIONS, RACE_OPTIONS } from '$lib/domain/card/taxonomy';
  import CardCategoryPopover from '$lib/features/card-editor/components/CardCategoryPopover.svelte';

  let { field, value, disabled = false, onChange }: {
    field: BatchEditableField; value: string; disabled?: boolean; onChange: (value: string) => void;
  } = $props();
  const typeOptions = [
    [17, 'normal', 'monster'], [33, 'effect', 'monster'], [97, 'fusion', 'monster'],
    [8225, 'synchro', 'monster'], [8388641, 'xyz', 'monster'], [67108897, 'link', 'monster'],
    [16777249, 'pendulum', 'monster'], [16385, 'token', 'monster'],
    [2, 'normal', 'spell'], [65538, 'quickplay', 'spell'], [131074, 'continuous', 'spell'],
    [262146, 'equip', 'spell'], [524290, 'field', 'spell'], [130, 'ritual', 'spell'],
    [4, 'normal', 'trap'], [131076, 'continuous', 'trap'], [1048580, 'counter', 'trap'],
  ] as const;
  const options = $derived(field === 'race' ? RACE_OPTIONS : field === 'attribute' ? ATTRIBUTE_OPTIONS : field === 'ot' ? PERMISSION_OPTIONS : []);
  const knownValue = $derived(value !== '' && (field === 'type'
    ? typeOptions.some(([number]) => number === Number(value))
    : options.some((option) => Number(option.value) === Number(value))));
  let custom = $state(false);
  $effect(() => { field; custom = false; });
</script>

{#if field === 'desc'}
  <textarea {disabled} {value} aria-label={$_(`batch_cdb.fields.${field}`)} rows="3" oninput={(event) => onChange(event.currentTarget.value)}></textarea>
{:else if options.length || field === 'type'}
  <div class="choice">
    <select {disabled} aria-label={$_(`batch_cdb.fields.${field}`)} value={custom || value && !knownValue ? '__custom__' : value}
      onchange={(event) => { custom = event.currentTarget.value === '__custom__'; if (!custom) onChange(event.currentTarget.value); }}>
      <option value="" disabled>{$_('batch_cdb.choose_value')}</option>
      {#if field === 'type'}
        {#each typeOptions as [number, subtype, family]}
          <option value={String(number)}>{$_(`editor.subtype.${subtype}`)} / {$_(`search.types.${family}`)}</option>
        {/each}
      {:else}
        {#each options as option}
          <option value={String(option.value)}>{option.key ? $_(option.key) : option.label}</option>
        {/each}
      {/if}
      <option value="__custom__">{$_('batch_cdb.custom_value')}</option>
    </select>
    {#if custom || value && !knownValue}
      <input type="text" {disabled} {value} placeholder={$_('batch_cdb.number_hint')} aria-label={$_('batch_cdb.custom_value')} oninput={(event) => onChange(event.currentTarget.value)} />
    {/if}
  </div>
{:else}
  <div class="value-input">
    <input type="text" {disabled} {value} aria-label={$_(`batch_cdb.fields.${field}`)}
      placeholder={$_(field === 'setcode' ? 'batch_cdb.setcode_placeholder' : field === 'name' ? 'batch_cdb.text_placeholder' : 'batch_cdb.number_hint')}
      oninput={(event) => onChange(event.currentTarget.value)} />
    {#if field === 'category'}
      <CardCategoryPopover value={Number(value) || 0} title={$_('editor.category_title')} buttonLabel={$_('editor.category_button')}
        onChange={(number) => { if (!disabled) onChange(String(number)); }} />
    {/if}
  </div>
{/if}

<style>
  .choice, .value-input { display: flex; gap: 8px; align-items: center; min-width: 0; }
  .choice > * { flex: 1; }
  input, select, textarea { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); color: var(--text-primary); font: inherit; }
  input:focus, select:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--accent-primary) 45%, transparent); outline-offset: 1px; }
  textarea { resize: vertical; min-height: 70px; }
  :disabled { opacity: .6; }
</style>
