<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type {
    AnalyzeCdbMergeResponse,
    MergeSourceItem,
  } from '$lib/infrastructure/tauri/commands';

  let draggedPath = $state('');
  let isPointerSorting = $state(false);

  let {
    open = false,
    state: dialogState,
    onClose = () => {},
    onPickFiles = async () => {},
    onPickFolder = async () => {},
    onRemoveSource = (_path: string) => {},
    onMoveSource = (_path: string, _direction: -1 | 1) => {},
    onReorderSource = (_draggedPath: string, _targetPath: string) => {},
    onSetIncludeImages = (_value: boolean) => {},
    onSetIncludeScripts = (_value: boolean) => {},
    onAnalyze = async () => {},
    onConfirm = async () => {},
  }: {
    open?: boolean;
    state: {
      mergeSources: MergeSourceItem[];
      mergeIncludeImages: boolean;
      mergeIncludeScripts: boolean;
      isCollectingMergeSources: boolean;
      isAnalyzingMerge: boolean;
      isMergingCdb: boolean;
      mergeAnalysis: AnalyzeCdbMergeResponse | null;
    };
    onClose?: () => void;
    onPickFiles?: () => void | Promise<void>;
    onPickFolder?: () => void | Promise<void>;
    onRemoveSource?: (path: string) => void;
    onMoveSource?: (path: string, direction: -1 | 1) => void;
    onReorderSource?: (draggedPath: string, targetPath: string) => void;
    onSetIncludeImages?: (value: boolean) => void;
    onSetIncludeScripts?: (value: boolean) => void;
    onAnalyze?: () => void | Promise<void>;
    onConfirm?: () => void | Promise<void>;
  } = $props();

  function handleSortStart(path: string) {
    draggedPath = path;
    isPointerSorting = true;
  }

  function handleRowMouseDown(event: MouseEvent, path: string) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, label, a')) {
      return;
    }

    handleSortStart(path);
  }

  function handleSortHover(targetPath: string) {
    if (!isPointerSorting || !draggedPath || draggedPath === targetPath) {
      return;
    }

    onReorderSource(draggedPath, targetPath);
  }

  function handleSortEnd() {
    draggedPath = '';
    isPointerSorting = false;
  }
</script>

<svelte:window onmouseup={handleSortEnd} onblur={handleSortEnd} />

{#if open}
  <div class="shell-dialog-backdrop" role="presentation" onclick={(event) => event.currentTarget === event.target && onClose()}>
    <div class="shell-dialog shell-dialog-wide" role="dialog" aria-modal="true" aria-label={$_('editor.merge_cdb_title')}>
      <div class="shell-dialog-header">
        <div>
          <h3>{$_('editor.merge_cdb_title')}</h3>
          <p>{$_('editor.merge_cdb_hint')}</p>
        </div>
        <button class="close-dialog-btn" type="button" onclick={onClose}>×</button>
      </div>
      <div class="shell-dialog-body">
        <div class="merge-toolbar">
          <button class="btn-secondary btn-sm" type="button" onclick={onPickFiles} disabled={dialogState.isCollectingMergeSources || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>
            {$_('editor.merge_cdb_add_files')}
          </button>
          <button class="btn-secondary btn-sm" type="button" onclick={onPickFolder} disabled={dialogState.isCollectingMergeSources || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>
            {dialogState.isCollectingMergeSources ? $_('editor.merge_cdb_collecting') : $_('editor.merge_cdb_add_folder')}
          </button>
        </div>

        <div class="field">
          <span>{$_('editor.merge_cdb_source_list')}</span>
          <p class="shell-dialog-hint">{$_('editor.merge_cdb_order_hint')}</p>
          <div class="merge-source-list">
            {#if dialogState.mergeSources.length === 0}
              <div class="merge-empty">{$_('editor.merge_cdb_source_empty')}</div>
            {:else}
              {#each dialogState.mergeSources as source, index}
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <div
                  class="merge-source-item"
                  class:dragging={draggedPath === source.path}
                  role="listitem"
                  onmousedown={(event) => handleRowMouseDown(event, source.path)}
                  onmouseenter={() => handleSortHover(source.path)}
                >
                  <div class="merge-source-meta">
                    <strong>{index + 1}. {source.name}</strong>
                    <small>{source.path}</small>
                    {#if source.cardTotal !== undefined}
                      <small>{$_('editor.merge_cdb_source_card_total', { values: { count: String(source.cardTotal) } })}</small>
                    {/if}
                  </div>
                  <div class="merge-source-actions">
                    <button class="btn-icon" type="button" onclick={() => onMoveSource(source.path, -1)} disabled={index === 0 || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>↑</button>
                    <button class="btn-icon" type="button" onclick={() => onMoveSource(source.path, 1)} disabled={index === dialogState.mergeSources.length - 1 || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>↓</button>
                    <button class="btn-icon btn-danger-soft" type="button" onclick={() => onRemoveSource(source.path)} disabled={dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>×</button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="merge-options">
          <label class="shell-toggle">
            <input type="checkbox" checked={dialogState.mergeIncludeImages} onchange={(event) => onSetIncludeImages((event.currentTarget as HTMLInputElement).checked)} />
            <span>{$_('editor.merge_cdb_include_images')}</span>
          </label>
          <label class="shell-toggle">
            <input type="checkbox" checked={dialogState.mergeIncludeScripts} onchange={(event) => onSetIncludeScripts((event.currentTarget as HTMLInputElement).checked)} />
            <span>{$_('editor.merge_cdb_include_scripts')}</span>
          </label>
        </div>

        <div class="merge-summary-row">
          <button class="btn-secondary btn-sm" type="button" onclick={onAnalyze} disabled={dialogState.isCollectingMergeSources || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>
            {dialogState.isAnalyzingMerge ? $_('editor.merge_cdb_analyzing') : $_('editor.merge_cdb_analyze')}
          </button>
          {#if dialogState.mergeAnalysis}
            <p class="shell-dialog-hint">
              {$_('editor.merge_cdb_summary', {
                values: {
                  sources: String(dialogState.mergeAnalysis.sourceCount),
                  merged: String(dialogState.mergeAnalysis.mergedTotal),
                  duplicates: String(dialogState.mergeAnalysis.duplicateCardTotal),
                  images: String(dialogState.mergeAnalysis.mainImageTotal),
                  fieldImages: String(dialogState.mergeAnalysis.fieldImageTotal),
                  scripts: String(dialogState.mergeAnalysis.scriptTotal),
                },
              })}
            </p>
          {/if}
        </div>

        {#if dialogState.mergeAnalysis}
          <div class="field">
            <span>{$_('editor.merge_cdb_plan_title')}</span>
            <div class="merge-plan-list">
              {#each dialogState.mergeAnalysis.sources as source}
                <div class="merge-plan-item">
                  <strong>{source.name}</strong>
                  <small>{source.path}</small>
                  <small>{$_('editor.merge_cdb_plan_item', {
                    values: {
                      cards: String(source.winningCardCount),
                      images: String(source.winningMainImageCount),
                      fieldImages: String(source.winningFieldImageCount),
                      scripts: String(source.winningScriptCount),
                    },
                  })}</small>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      <div class="shell-dialog-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={onClose} disabled={dialogState.isCollectingMergeSources || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>{$_('editor.cancel')}</button>
        <button class="btn-primary btn-sm" type="button" onclick={onConfirm} disabled={dialogState.isCollectingMergeSources || dialogState.isAnalyzingMerge || dialogState.isMergingCdb}>
          {dialogState.isMergingCdb ? $_('editor.merge_cdb_merging') : $_('editor.merge_cdb_confirm')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .shell-dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(2, 6, 23, 0.62);
    backdrop-filter: blur(4px);
  }

  .shell-dialog {
    width: min(560px, 94vw);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(2, 6, 23, 0.32);
  }

  .shell-dialog-wide {
    width: min(980px, 96vw);
  }

  .shell-dialog-header,
  .shell-dialog-actions {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .shell-dialog-actions {
    border-bottom: none;
    border-top: 1px solid var(--border-color);
    justify-content: flex-end;
  }

  .shell-dialog-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .shell-dialog-header p,
  .shell-dialog-hint {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.84rem;
  }

  .shell-dialog-body {
    padding: 18px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field span {
    font-size: 0.84rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .merge-toolbar,
  .merge-options,
  .merge-summary-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .merge-source-list,
  .merge-plan-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .merge-source-item,
  .merge-plan-item {
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-base);
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .merge-source-item {
    cursor: grab;
  }

  .merge-source-item.dragging {
    opacity: 0.55;
    border-style: dashed;
  }

  .merge-source-meta,
  .merge-plan-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .merge-source-meta small,
  .merge-plan-item small {
    color: var(--text-secondary);
    word-break: break-all;
  }

  .merge-source-actions {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .merge-empty {
    padding: 18px;
    border: 1px dashed var(--border-color);
    border-radius: 12px;
    color: var(--text-secondary);
    background: var(--bg-base);
  }

  .shell-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-base);
    min-width: 0;
  }

  .shell-toggle input {
    width: auto;
    margin: 0;
  }

  .btn-sm {
    padding: 0.42rem 0.8rem;
    font-size: 0.84rem;
    font-weight: 700;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #fff;
  }

  .btn-secondary {
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-primary);
    border: 1px solid rgba(148, 163, 184, 0.22);
  }

  .btn-icon {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-primary);
    cursor: pointer;
  }

  .btn-danger-soft {
    color: #dc2626;
  }
  .close-dialog-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    font-size: 1.35rem;
    line-height: 1;
    border-radius: 999px;
    background: var(--bg-surface-active);
    color: var(--text-primary);
    border: none;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .merge-source-item,
    .merge-plan-item {
      flex-direction: column;
    }

    .merge-source-actions {
      align-self: flex-end;
    }
  }
</style>
