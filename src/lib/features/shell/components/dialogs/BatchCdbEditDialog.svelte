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
    type BatchOperationGroup,
    type BatchOperationPreview,
  } from '$lib/native/cdbApi';
  import type { CardDataEntry } from '$lib/types';
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
  type BatchField =
    | 'alias'
    | 'ot'
    | 'type'
    | 'attack'
    | 'defense'
    | 'level'
    | 'race'
    | 'attribute'
    | 'category'
    | 'lscale'
    | 'rscale'
    | 'linkMarker'
    | 'ruleCode'
    | 'name'
    | 'desc'
    | 'setcode';

  type FieldOperation = {
    id: string;
    groupId: string;
    field: BatchField;
    value: string;
  };

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  const fieldOptions: Array<{ value: BatchField; label: string; kind: 'number' | 'text' | 'setcode' }> = [
    { value: 'alias', label: 'Alias', kind: 'number' },
    { value: 'ot', label: 'OT / 许可', kind: 'number' },
    { value: 'type', label: 'Type', kind: 'number' },
    { value: 'attack', label: 'ATK', kind: 'number' },
    { value: 'defense', label: 'DEF', kind: 'number' },
    { value: 'level', label: 'Level', kind: 'number' },
    { value: 'race', label: 'Race', kind: 'number' },
    { value: 'attribute', label: 'Attribute', kind: 'number' },
    { value: 'category', label: 'Category', kind: 'number' },
    { value: 'lscale', label: 'Left Scale', kind: 'number' },
    { value: 'rscale', label: 'Right Scale', kind: 'number' },
    { value: 'linkMarker', label: 'Link Marker', kind: 'number' },
    { value: 'ruleCode', label: 'Rule Code', kind: 'number' },
    { value: 'name', label: 'Name', kind: 'text' },
    { value: 'desc', label: 'Description', kind: 'text' },
    { value: 'setcode', label: 'Setcode', kind: 'setcode' },
  ];

  let target = $state<BatchTarget>('selection');
  let selectedGroupId = $state('');
  let groupName = $state('');
  let operations = $state<FieldOperation[]>([
    { id: crypto.randomUUID(), groupId: '', field: 'category', value: '' },
  ]);
  let isRunning = $state(false);
  let preview = $state<BatchOperationPreview | null>(null);

  function getFieldKind(field: BatchField) {
    return fieldOptions.find((option) => option.value === field)?.kind ?? 'number';
  }

  function parseNumericValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed.slice(2), 16)
      : Number(trimmed));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseSetcodeValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.startsWith('0x') || item.startsWith('0X')
        ? Number.parseInt(item.slice(2), 16)
        : Number.parseInt(item, 16))
      .filter((item) => Number.isFinite(item));
  }

  function normalizeOperationValue(operation: FieldOperation) {
    const kind = getFieldKind(operation.field);
    if (kind === 'text') {
      return operation.value;
    }
    if (kind === 'setcode') {
      return parseSetcodeValue(operation.value);
    }
    return parseNumericValue(operation.value);
  }

  function invalidatePreview() {
    if (preview) {
      discardBatchOperationPreview(preview.previewId);
    }
    preview = null;
  }

  function closeDialog() {
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
    operations = operations.map((operation) => (
      operation.groupId ? operation : { ...operation, groupId: group.id }
    ));
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
    operations = operations.map((operation) => (
      operation.groupId === deletedGroupId ? { ...operation, groupId: '' } : operation
    ));
    invalidatePreview();
  }

  function addOperation() {
    operations = [...operations, {
      id: crypto.randomUUID(),
      groupId: selectedGroupId || getCardGroups()[0]?.id || '',
      field: 'category',
      value: '',
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
    if (!tab) return;

    const groups: BatchOperationGroup[] = getCardGroups().map((group) => ({
      id: group.id,
      cardIds: [...group.cardIds],
    }));
    const groupIds = new Set(groups.map((group) => group.id));
    if (operations.some((operation) => !operation.groupId || !groupIds.has(operation.groupId))) {
      showToast($_('batch_cdb.group_required'), 'error');
      return;
    }

    isRunning = true;
    try {
      invalidatePreview();
      const normalizedOperations: BatchFieldOperation[] = operations.map((operation) => ({
        groupId: operation.groupId,
        field: operation.field,
        value: normalizeOperationValue(operation),
      }));
      preview = await previewBatchOperations(tab.id, groups, normalizedOperations);
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      isRunning = false;
    }
  }

  async function applyBatch() {
    const tab = get(activeTab);
    if (!tab || !preview) return;
    const confirmed = await tauriBridge.ask(
      $_('batch_cdb.confirm_message', {
        values: {
          changed: String(preview.changedCount),
          target: String(preview.targetCount),
        },
      }) as string,
      { title: $_('batch_cdb.title') as string, kind: 'warning' },
    );
    if (!confirmed) return;

    isRunning = true;
    try {
      const ok = await startTask({
        kind: 'batch.cdb.apply',
        sessionId: tab.id,
        previewId: preview.previewId,
      }) as boolean;
      showToast($_(ok ? 'batch_cdb.apply_success' : 'batch_cdb.apply_failed'), ok ? 'success' : 'error');
      if (ok) {
        appendWorkspaceTaskHistory({
          kind: 'batch.cdb.apply',
          label: $_('batch_cdb.title'),
          summary: {
            targetCount: preview.targetCount,
            changedCount: preview.changedCount,
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
  <div class="dialog-backdrop" role="presentation" onclick={closeDialog}>
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
          <h2>{$_('batch_cdb.title')}</h2>
          <p>{$_('batch_cdb.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={closeDialog}>×</button>
      </header>

      <div class="target-row">
        <label>
          <input type="radio" bind:group={target} value="selection" />
          {$_('batch_cdb.target_selection')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="filter" />
          {$_('batch_cdb.target_filter')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="group" />
          {$_('card_group.target_group')}
        </label>
      </div>

      <div class="group-panel">
        <div class="group-create-row">
          <input type="text" bind:value={groupName} placeholder={$_('card_group.name_placeholder')} />
          <button type="button" class="secondary-action" onclick={() => void saveCurrentTargetAsGroup()}>
            {$_('card_group.save_target')}
          </button>
        </div>
        <div class="group-manage-row">
          <select bind:value={selectedGroupId}>
            <option value="">{$_('card_group.no_group')}</option>
            {#each getCardGroups() as group}
              <option value={group.id}>{group.name} · {group.cardIds.length}</option>
            {/each}
          </select>
          <button type="button" class="secondary-action" onclick={addSelectionToCurrentGroup} disabled={!selectedGroupId}>
            {$_('card_group.add_selection')}
          </button>
          <button type="button" class="secondary-action" onclick={removeSelectionFromCurrentGroup} disabled={!selectedGroupId}>
            {$_('card_group.remove_selection')}
          </button>
          <button type="button" class="danger-action" onclick={deleteCurrentGroup} disabled={!selectedGroupId}>
            {$_('editor.delete')}
          </button>
        </div>
      </div>

      <div class="operations">
        {#each operations as operation (operation.id)}
          <div class="operation-row">
            <select bind:value={operation.groupId} onchange={invalidatePreview} aria-label={$_('card_group.target_group')}>
              <option value="">{$_('card_group.no_group')}</option>
              {#each getCardGroups() as group}
                <option value={group.id}>{group.name} · {group.cardIds.length}</option>
              {/each}
            </select>
            <select bind:value={operation.field} onchange={invalidatePreview}>
              {#each fieldOptions as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <input
              type="text"
              bind:value={operation.value}
              placeholder={getFieldKind(operation.field) === 'setcode' ? '01CC, 1234' : $_('batch_cdb.empty_hint')}
              oninput={invalidatePreview}
            />
            <button type="button" class="icon-btn" onclick={() => removeOperation(operation.id)} disabled={operations.length === 1}>×</button>
          </div>
        {/each}
      </div>

      <button type="button" class="secondary-action" onclick={addOperation}>
        {$_('batch_cdb.add_operation')}
      </button>

      {#if preview}
        <div class="preview">
          <strong>{$_('batch_cdb.preview_summary', {
            values: {
              target: String(preview.targetCount),
              changed: String(preview.changedCount),
            },
          })}</strong>
          {#if preview.sample.length}
            <ul>
              {#each preview.sample as card}
                <li>{card.code} · {card.name}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <footer>
        <button type="button" class="secondary-action" onclick={closeDialog}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="secondary-action" onclick={() => void buildPreview()} disabled={isRunning}>
          {isRunning ? '...' : $_('batch_cdb.preview')}
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
    width: min(720px, 100%);
    max-height: min(780px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-surface);
    box-shadow: var(--shadow-popover);
    color: var(--text-primary);
    overflow: auto;
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
  }

  .group-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: color-mix(in srgb, var(--bg-base) 82%, var(--bg-surface));
  }

  .group-create-row,
  .group-manage-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .group-manage-row {
    grid-template-columns: minmax(0, 1fr) auto auto auto;
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
    display: grid;
    grid-template-columns: 180px 150px minmax(0, 1fr) 32px;
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
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 45%, var(--border-color));
    border-radius: var(--control-radius);
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-base));
  }

  ul {
    margin: 0;
    padding-left: 18px;
    color: var(--text-secondary);
  }

  footer {
    justify-content: flex-end;
    padding-top: 8px;
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
</style>
