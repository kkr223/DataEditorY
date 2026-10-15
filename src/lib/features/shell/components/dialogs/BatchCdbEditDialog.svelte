<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { activeTab } from '$lib/stores/db';
  import { getSelectedCardIds } from '$lib/stores/editor.svelte';
  import { getCardsByIdsInTab } from '$lib/stores/cardOperations';
  import { parseCachedFiltersJson, queryCardsByFiltersInTab } from '$lib/stores/search';
  import { showToast } from '$lib/stores/toast.svelte';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { startTask } from '$lib/native/taskApi';
  import {
    discardBatchOperationPreview,
    previewBatchOperations,
    type BatchFieldOperation,
    type BatchOperationPreview,
  } from '$lib/native/cdbApi';
  import { parseBatchInput, formatBatchValue, type BatchEditableField } from '$lib/domain/card/batchInput';
  import BatchFieldInput from './BatchFieldInput.svelte';
  import {
    addCardsToGroup,
    appendWorkspaceTaskHistory,
    deleteCardGroup,
    getCardGroupById,
    getCardGroups,
    removeCardsFromGroup,
    upsertCardGroup,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

  type BatchTarget = 'selection' | 'filter' | 'group';
  type BatchField = BatchEditableField;

  type FieldOperation = {
    id: string;
    field: BatchField;
    value: string;
    clear: boolean;
  };

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  const fieldOptions: BatchField[] = ['setcode', 'attack', 'defense', 'level', 'type', 'race', 'attribute', 'ot', 'category', 'lscale', 'rscale', 'linkMarker', 'alias', 'ruleCode', 'name', 'desc'];

  let target = $state<BatchTarget>('selection');
  let selectedGroupId = $state('');
  let groupName = $state('');
  let operations = $state<FieldOperation[]>([
    { id: crypto.randomUUID(), field: 'setcode', value: '', clear: false },
  ]);
  let isRunning = $state(false);
  let preview = $state<BatchOperationPreview | null>(null);
  let previewSessionId = '';
  let requestSequence = 0;
  let lastInputsKey = '';
  const targetCount = $derived(target === 'selection' ? getSelectedCardIds().length : target === 'group' ? getCardGroupById(selectedGroupId)?.cardIds.length ?? 0 : $activeTab?.cachedTotal ?? 0);
  const editedFields = $derived([...new Set(operations.map((operation) => operation.field))]);

  function normalizeOperationValue(operation: FieldOperation) {
    if (!operation.clear && !operation.value.trim()) throw new Error($_('batch_cdb.value_required'));
    try {
      return parseBatchInput(operation.field, operation.clear ? '' : operation.value);
    } catch {
      throw new Error(`${$_(`batch_cdb.fields.${operation.field}`)}: ${$_(operation.field === 'setcode' ? 'batch_cdb.invalid_setcode' : 'batch_cdb.invalid_number')}`);
    }
  }

  function invalidatePreview() {
    requestSequence += 1;
    if (preview) {
      discardBatchOperationPreview(preview.previewId);
    }
    preview = null;
    previewSessionId = '';
  }

  $effect(() => {
    const key = JSON.stringify({ open, session: $activeTab?.id, target, selectedGroupId, operations,
      ids: target === 'selection' ? getSelectedCardIds() : target === 'group' ? getCardGroupById(selectedGroupId)?.cardIds : $activeTab?.cachedFilters });
    if (key === lastInputsKey) return;
    lastInputsKey = key;
    invalidatePreview();
  });

  function closeDialog() {
    if (isRunning) return;
    invalidatePreview();
    onClose();
  }

  async function resolveTargetCards() {
    const tab = get(activeTab);
    if (!tab) return [];

    if (target === 'group') {
      const group = getCardGroupById(selectedGroupId);
      return group ? getCardsByIdsInTab(tab.id, group.cardIds) : [];
    }

    if (target === 'selection') {
      return getCardsByIdsInTab(tab.id, getSelectedCardIds());
    }

    return queryCardsByFiltersInTab(tab.id, parseCachedFiltersJson(tab.cachedFilters));
  }

  async function saveCurrentTargetAsGroup() {
    const cards = await resolveTargetCards();
    if (cards.length === 0) {
      showToast($_('card_group.empty_target'), 'error');
      return;
    }
    const group = upsertCardGroup({
      name: groupName.trim() || $_('card_group.default_name'),
      cardIds: cards.map((card) => card.code),
      source: target === 'filter' ? 'filter' : target === 'selection' ? 'selection' : 'manual',
    });
    selectedGroupId = group.id;
    target = 'group';
    groupName = '';
    invalidatePreview();
    showToast($_('card_group.saved'), 'success');
  }

  function addSelectionToCurrentGroup() {
    if (!selectedGroupId) return;
    const ids = getSelectedCardIds();
    addCardsToGroup(selectedGroupId, ids);
    invalidatePreview();
  }

  function removeSelectionFromCurrentGroup() {
    if (!selectedGroupId) return;
    const ids = getSelectedCardIds();
    removeCardsFromGroup(selectedGroupId, ids);
    invalidatePreview();
  }

  function deleteCurrentGroup() {
    if (!selectedGroupId) return;
    const deletedGroupId = selectedGroupId;
    deleteCardGroup(deletedGroupId);
    selectedGroupId = getCardGroups()[0]?.id ?? '';
    invalidatePreview();
  }

  function addOperation() {
    operations = [...operations, {
      id: crypto.randomUUID(),
      field: 'setcode',
      value: '',
      clear: false,
    }];
    invalidatePreview();
  }

  function removeOperation(id: string) {
    if (operations.length === 1) return;
    operations = operations.filter((operation) => operation.id !== id);
    invalidatePreview();
  }

  async function buildPreview() {
    const tab = get(activeTab);
    if (!tab || isRunning) return;
    invalidatePreview();
    const sequence = requestSequence;
    isRunning = true;
    try {
      const normalizedOperations: BatchFieldOperation[] = operations.map((operation) => ({
        groupId: 'target',
        field: operation.field,
        value: normalizeOperationValue(operation),
      }));
      const targetCards = await resolveTargetCards();
      if (sequence !== requestSequence || get(activeTab)?.id !== tab.id || !open) return;
      if (!targetCards.length) { showToast($_('card_group.empty_target'), 'error'); return; }
      const result = await previewBatchOperations(tab.id, [{ id: 'target', cardIds: targetCards.map((card) => card.code) }], normalizedOperations);
      if (sequence !== requestSequence || get(activeTab)?.id !== tab.id || !open) { discardBatchOperationPreview(result.previewId); return; }
      previewSessionId = tab.id;
      preview = result;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      isRunning = false;
    }
  }

  async function applyBatch() {
    const tab = get(activeTab);
    const snapshot = preview;
    if (!tab || !snapshot || isRunning || previewSessionId !== tab.id) return;
    isRunning = true;
    try {
      const confirmed = await tauriBridge.ask(
        $_('batch_cdb.confirm_message', {
          values: {
            changed: String(snapshot.changedCount),
            target: String(snapshot.targetCount),
          },
        }) as string,
        { title: $_('batch_cdb.title') as string, kind: 'warning' },
      );
      if (!confirmed) return;
      if (get(activeTab)?.id !== tab.id || preview !== snapshot) { invalidatePreview(); return; }
      const ok = await startTask({
        kind: 'batch.cdb.apply',
        sessionId: tab.id,
        previewId: snapshot.previewId,
      }) as boolean;
      showToast($_(ok ? 'batch_cdb.apply_success' : 'batch_cdb.apply_failed'), ok ? 'success' : 'error');
      if (!ok) { invalidatePreview(); return; }
      if (ok && get(activeTab)?.id === tab.id) {
        appendWorkspaceTaskHistory({
          kind: 'batch.cdb.apply',
          label: $_('batch_cdb.title'),
          summary: {
            targetCount: snapshot.targetCount,
            changedCount: snapshot.changedCount,
            operationCount: operations.length,
          },
        });
        preview = null;
        onClose();
      }
    } catch (error) {
      invalidatePreview();
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      isRunning = false;
    }
  }

  onDestroy(invalidatePreview);
</script>

{#if open}
  <div class="dialog-backdrop" role="presentation">
    <div
      class="batch-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={$_('batch_cdb.title')}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === 'Escape') closeDialog(); }}
    >
      <header>
        <div>
          <span class="workspace-name">{$activeTab?.name ?? ''}</span>
          <h2>{$_('batch_cdb.title')}</h2>
          <p>{$_('batch_cdb.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={closeDialog} disabled={isRunning} aria-label={$_('batch_cdb.close')}>×</button>
      </header>

      <div class="dialog-content">
      <div class="edit-column">
      <h3 class="section-heading"><span>1</span>{$_('batch_cdb.scope')}<small>{targetCount} {$_('batch_cdb.cards_unit')}</small></h3>
      <div class="target-row">
        <label>
          <input type="radio" bind:group={target} value="selection" disabled={isRunning} />
          {$_('batch_cdb.target_selection')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="filter" disabled={isRunning} />
          {$_('batch_cdb.target_filter')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="group" disabled={isRunning} />
          {$_('card_group.target_group')}
        </label>
      </div>
      {#if target === 'group'}
        <select bind:value={selectedGroupId} disabled={isRunning} aria-label={$_('card_group.target_group')}>
          <option value="">{$_('card_group.no_group')}</option>
          {#each getCardGroups() as group}<option value={group.id}>{group.name} · {group.cardIds.length}</option>{/each}
        </select>
      {/if}

      <details class="group-panel">
        <summary>{$_('batch_cdb.manage_groups')}</summary>
        <div class="group-create-row">
          <input type="text" bind:value={groupName} placeholder={$_('card_group.name_placeholder')} disabled={isRunning} aria-label={$_('card_group.name_placeholder')} />
          <button type="button" class="secondary-action" disabled={isRunning} onclick={() => void saveCurrentTargetAsGroup()}>
            {$_('card_group.save_target')}
          </button>
        </div>
        {#if target === 'group'}
        <div class="group-manage-row">
          <button type="button" class="secondary-action" onclick={addSelectionToCurrentGroup} disabled={isRunning || !selectedGroupId}>
            {$_('card_group.add_selection')}
          </button>
          <button type="button" class="secondary-action" onclick={removeSelectionFromCurrentGroup} disabled={isRunning || !selectedGroupId}>
            {$_('card_group.remove_selection')}
          </button>
          <button type="button" class="danger-action" onclick={deleteCurrentGroup} disabled={isRunning || !selectedGroupId}>
            {$_('editor.delete')}
          </button>
        </div>
        {/if}
      </details>

      <h3 class="section-heading fields-heading"><span>2</span>{$_('batch_cdb.changes')}</h3>
      <p class="section-hint">{$_('batch_cdb.operations_hint')}</p>
      <div class="operations">
        {#each operations as operation, index (operation.id)}
          <div class="operation-row">
            <div class="operation-heading"><code>{String(index + 1).padStart(2, '0')}</code>
            <select bind:value={operation.field} disabled={isRunning} aria-label={$_('batch_cdb.field')} onchange={() => { operation.value = ''; operation.clear = false; }}>
              {#each fieldOptions as option}
                <option value={option}>{$_(`batch_cdb.fields.${option}`)}</option>
              {/each}
            </select>
            <button type="button" class="icon-btn" onclick={() => removeOperation(operation.id)} disabled={isRunning || operations.length === 1} aria-label={$_('batch_cdb.remove_operation')}>×</button>
            </div>
            {#if operation.clear}<div class="reset-value">{$_('batch_cdb.reset_value')}</div>
            {:else}<BatchFieldInput field={operation.field} value={operation.value} disabled={isRunning} onChange={(value) => { operation.value = value; }} />{/if}
            <div class="operation-footnote"><label><input type="checkbox" bind:checked={operation.clear} disabled={isRunning} />{$_('batch_cdb.clear_field')}</label>
              {#if operation.field === 'setcode'}<span>{$_('batch_cdb.setcode_hint')}</span>{/if}
            </div>
          </div>
        {/each}
      </div>

      <button type="button" class="add-operation" onclick={addOperation} disabled={isRunning}>
        + {$_('batch_cdb.add_operation')}
      </button>
      </div>

      <aside class="preview-column">
      <h3 class="section-heading"><span>3</span>{$_('batch_cdb.preview')}</h3>
      {#if preview}
        <div class="preview">
          <div class="preview-number"><b>{preview.changedCount}</b><span>{$_('batch_cdb.changed_cards')}</span></div>
          <strong>{$_('batch_cdb.preview_summary', {
            values: {
              target: String(preview.targetCount),
              changed: String(preview.changedCount),
            },
          })}</strong>
          {#if preview.changes.length}
            <ul>
              {#each preview.changes as { before, after }}
                <li><div class="card-title"><code>{after.code}</code><b>{before.name}</b></div>
                  {#each editedFields as field}
                    {#if formatBatchValue(field, before[field]) !== formatBatchValue(field, after[field])}
                      <div class="field-diff"><span>{$_(`batch_cdb.fields.${field}`)}</span><div><del>{formatBatchValue(field, before[field])}</del><span>→</span><ins>{formatBatchValue(field, after[field])}</ins></div></div>
                    {/if}
                  {/each}
                </li>
              {/each}
            </ul>
          {/if}
          {#if !preview.changedCount}<p>{$_('batch_cdb.no_changes')}</p>{/if}
          {#if preview.changedCount > preview.changes.length}<p>{$_('batch_cdb.sample_hint', { values: { count: String(preview.changes.length) } })}</p>{/if}
        </div>
      {:else}
        <div class="preview-empty"><span>↔</span><p>{$_('batch_cdb.preview_empty')}</p><small>{$_('batch_cdb.preview_hint')}</small></div>
      {/if}
      </aside>
      </div>

      <footer>
        <span class="save-hint">{$_('batch_cdb.save_hint')}</span>
        <button type="button" class="secondary-action" onclick={closeDialog} disabled={isRunning}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="secondary-action" onclick={() => void buildPreview()} disabled={isRunning || !targetCount}>
          {isRunning ? $_('batch_cdb.working') : $_('batch_cdb.preview')}
        </button>
        <button type="button" class="primary-action" onclick={() => void applyBatch()} disabled={isRunning || !preview || preview.changedCount === 0}>
          {$_('batch_cdb.apply')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.42);
  }

  .batch-dialog {
    width: min(1000px, 100%);
    max-height: min(780px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-surface);
    box-shadow: var(--shadow-popover);
    color: var(--text-primary);
    overflow: hidden;
  }

  header,
  footer,
  .target-row,
  .group-create-row,
  .group-manage-row,
  .operation-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  header {
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    font-size: 1.08rem;
  }

  p {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .close-btn,
  .icon-btn {
    border: none;
    border-radius: var(--control-radius);
    background: var(--bg-surface-active);
    color: var(--text-primary);
    cursor: pointer;
  }

  .close-btn {
    width: 30px;
    height: 30px;
  }

  .target-row {
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  .group-panel {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: .8rem;
  }

  .group-create-row,
  .group-manage-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .group-manage-row {
    grid-template-columns: repeat(3, auto);
    margin-top: 8px;
  }

  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-secondary);
  }

  .operations {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .operation-row {
    display: block;
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  select,
  input {
    min-width: 0;
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 0.42rem 0.55rem;
    font: inherit;
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--text-secondary);
  }

  footer {
    justify-content: flex-end;
    padding: 14px 24px;
    border-top: 1px solid var(--border-color);
  }

  .primary-action,
  .secondary-action,
  .danger-action {
    border: none;
    border-radius: var(--control-radius);
    padding: 0.48rem 0.72rem;
    font-weight: 700;
    cursor: pointer;
  }

  .primary-action {
    background: var(--accent-primary);
    color: white;
  }

  .secondary-action {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  .danger-action {
    background: var(--danger);
    color: white;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .dialog-content { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(260px, 1fr); overflow: auto; min-height: 0; }
  .edit-column, .preview-column { padding: 22px 24px; }
  .preview-column { border-left: 1px solid var(--border-color); background: color-mix(in srgb, var(--bg-base) 65%, var(--bg-surface)); }
  .workspace-name { display: block; color: var(--text-secondary); font-size: .73rem; margin-bottom: 5px; }
  .section-heading { display: flex; gap: 9px; align-items: center; font-size: .96rem; margin: 0 0 12px; }
  .section-heading > span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border-color); font-size: .74rem; color: var(--text-secondary); }
  .section-heading small { margin-left: auto; font-size: .75rem; font-weight: 400; color: var(--text-secondary); }
  .fields-heading { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border-color); }
  .section-hint { font-size: .8rem; margin-bottom: 13px; }
  .operation-heading { display: grid; grid-template-columns: 24px minmax(0, 1fr) 28px; gap: 8px; align-items: center; margin-bottom: 10px; }
  .operation-heading code { font-size: .75rem; color: var(--text-secondary); }
  .operation-heading .icon-btn { width: 28px; height: 28px; }
  .operation-footnote { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 9px; font-size: .72rem; color: var(--text-secondary); }
  .operation-footnote input, .target-row input { width: auto; accent-color: var(--accent-primary); }
  .target-row label { justify-content: center; font-size: .8rem; }
  .target-row:has(input[value=selection]:checked) label:has(input[value=selection]), .target-row:has(input[value=filter]:checked) label:has(input[value=filter]), .target-row:has(input[value=group]:checked) label:has(input[value=group]) { color: var(--accent-primary); }
  .group-create-row { margin-top: 9px; }
  summary { cursor: pointer; padding: 5px 0; }
  .operations { margin-bottom: 10px; }
  .reset-value { padding: 10px; border: 1px dashed var(--border-color); color: var(--text-secondary); font-size: .82rem; }
  .add-operation { width: 100%; padding: 10px; border: 1px dashed var(--border-color); border-radius: var(--control-radius); background: transparent; color: var(--text-secondary); cursor: pointer; }
  .preview-number b { font-size: 2.2rem; color: var(--accent-primary); margin-right: 8px; } .preview-number span { font-size: .82rem; }
  .preview > strong { font-size: .8rem; font-weight: 400; color: var(--text-secondary); }
  .preview li { padding: 14px 0; border-top: 1px solid var(--border-color); }
  .card-title { display: flex; align-items: baseline; gap: 8px; font-size: .85rem; overflow-wrap: anywhere; } .card-title code { font-size: .73rem; }
  .field-diff { margin-top: 9px; font-size: .78rem; } .field-diff > span { display: block; margin-bottom: 3px; }
  .field-diff > div { display: flex; gap: 8px; flex-wrap: wrap; align-items: baseline; overflow-wrap: anywhere; white-space: pre-wrap; max-height: 110px; overflow: auto; }
  del, ins { text-decoration: none; } ins { color: var(--accent-primary); } .field-diff > div > span { opacity: .5; }
  .preview-empty { text-align: center; padding: 40px 8px; color: var(--text-secondary); } .preview-empty > span { display: block; font-size: 2.7rem; opacity: .3; margin-bottom: 15px; } .preview-empty small { display: block; margin-top: 10px; font-size: .75rem; line-height: 1.6; }
  .save-hint { margin-right: auto; color: var(--text-secondary); font-size: .74rem; }
  button:focus-visible, summary:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
  @media (max-width: 780px) { .dialog-content { grid-template-columns: 1fr; } .preview-column { border-left: 0; border-top: 1px solid var(--border-color); } footer { flex-wrap: wrap; } .save-hint { width: 100%; } .preview-empty { padding: 18px; } }
</style>
