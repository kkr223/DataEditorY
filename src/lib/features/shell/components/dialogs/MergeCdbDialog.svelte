<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { AnalyzeCdbMergeResponse } from '$lib/infrastructure/tauri/commands';

  let {
    open = false,
    state,
    onClose = () => {},
    onPickPath = async (_side: 'a' | 'b') => {},
    onAnalyze = async () => {},
    onConfirm = async () => {},
  }: {
    open?: boolean;
    state: {
      mergePathA: string;
      mergePathB: string;
      mergeConflictMode: 'preferA' | 'preferB' | 'manual';
      mergeIncludeImages: boolean;
      mergeIncludeScripts: boolean;
      isAnalyzingMerge: boolean;
      isMergingCdb: boolean;
      mergeAnalysis: AnalyzeCdbMergeResponse | null;
      manualMergeChoices: Record<number, 'a' | 'b'>;
    };
    onClose?: () => void;
    onPickPath?: (side: 'a' | 'b') => void | Promise<void>;
    onAnalyze?: () => void | Promise<void>;
    onConfirm?: () => void | Promise<void>;
  } = $props();
</script>

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
      <div class="shell-dialog-body shell-dialog-grid">
        <label class="field field-span-2">
          <span>{$_('editor.merge_cdb_a')}</span>
          <div class="path-picker-row">
            <input type="text" bind:value={state.mergePathA} placeholder={$_('editor.merge_cdb_pick_path')} />
            <button class="btn-secondary btn-sm" type="button" onclick={() => onPickPath('a')}>{$_('editor.browse')}</button>
          </div>
        </label>
        <label class="field field-span-2">
          <span>{$_('editor.merge_cdb_b')}</span>
          <div class="path-picker-row">
            <input type="text" bind:value={state.mergePathB} placeholder={$_('editor.merge_cdb_pick_path')} />
            <button class="btn-secondary btn-sm" type="button" onclick={() => onPickPath('b')}>{$_('editor.browse')}</button>
          </div>
        </label>
        <label class="field">
          <span>{$_('editor.merge_cdb_conflict_mode')}</span>
          <select bind:value={state.mergeConflictMode}>
            <option value="preferA">{$_('editor.merge_cdb_conflict_prefer_a')}</option>
            <option value="preferB">{$_('editor.merge_cdb_conflict_prefer_b')}</option>
            <option value="manual">{$_('editor.merge_cdb_conflict_manual')}</option>
          </select>
        </label>
        <label class="shell-toggle">
          <input type="checkbox" bind:checked={state.mergeIncludeImages} />
          <span>{$_('editor.merge_cdb_include_images')}</span>
        </label>
        <label class="shell-toggle">
          <input type="checkbox" bind:checked={state.mergeIncludeScripts} />
          <span>{$_('editor.merge_cdb_include_scripts')}</span>
        </label>
        <div class="field field-span-2">
          <button class="btn-secondary btn-sm" type="button" onclick={onAnalyze} disabled={state.isAnalyzingMerge || state.isMergingCdb}>
            {state.isAnalyzingMerge ? $_('editor.merge_cdb_analyzing') : $_('editor.merge_cdb_analyze')}
          </button>
          {#if state.mergeAnalysis}
            <p class="shell-dialog-hint">{$_('editor.merge_cdb_summary', { values: { a: String(state.mergeAnalysis.aTotal), b: String(state.mergeAnalysis.bTotal), merged: String(state.mergeAnalysis.mergedTotal), conflicts: String(state.mergeAnalysis.conflicts.length) } })}</p>
          {/if}
        </div>

        {#if state.mergeAnalysis && state.mergeConflictMode === 'manual' && state.mergeAnalysis.conflicts.length > 0}
          <div class="field field-span-2">
            <span>{$_('editor.merge_cdb_manual_conflicts')}</span>
            <div class="merge-conflict-list">
              {#each state.mergeAnalysis.conflicts as conflict}
                <div class="merge-conflict-item">
                  <div class="merge-conflict-meta">
                    <strong>{conflict.code} · {conflict.aCard.name || conflict.bCard.name || 'Unnamed'}</strong>
                    <small>
                      {#if conflict.hasCardConflict}{$_('editor.merge_cdb_conflict_card')}{/if}
                      {#if conflict.hasImageConflict} / {$_('editor.merge_cdb_conflict_image')}{/if}
                      {#if conflict.hasFieldImageConflict} / {$_('editor.merge_cdb_conflict_field_image')}{/if}
                      {#if conflict.hasScriptConflict} / {$_('editor.merge_cdb_conflict_script')}{/if}
                    </small>
                  </div>
                  <div class="merge-choice-row">
                    <label class="shell-toggle">
                      <input type="radio" name={`merge-${conflict.code}`} checked={state.manualMergeChoices[conflict.code] === 'a'} onchange={() => { state.manualMergeChoices = { ...state.manualMergeChoices, [conflict.code]: 'a' }; }} />
                      <span>A · {conflict.aCard.name || conflict.code}</span>
                    </label>
                    <label class="shell-toggle">
                      <input type="radio" name={`merge-${conflict.code}`} checked={state.manualMergeChoices[conflict.code] === 'b'} onchange={() => { state.manualMergeChoices = { ...state.manualMergeChoices, [conflict.code]: 'b' }; }} />
                      <span>B · {conflict.bCard.name || conflict.code}</span>
                    </label>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
      <div class="shell-dialog-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={onClose} disabled={state.isAnalyzingMerge || state.isMergingCdb}>{$_('editor.cancel')}</button>
        <button class="btn-primary btn-sm" type="button" onclick={onConfirm} disabled={state.isAnalyzingMerge || state.isMergingCdb}>
          {state.isMergingCdb ? $_('editor.merge_cdb_merging') : $_('editor.merge_cdb_confirm')}
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
    width: min(920px, 96vw);
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
  .shell-dialog-hint,
  .merge-conflict-meta small {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.84rem;
  }

  .shell-dialog-body {
    padding: 18px;
    overflow: auto;
  }

  .shell-dialog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field-span-2 {
    grid-column: span 2;
  }

  .field span {
    font-size: 0.84rem;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .field input,
  .field select {
    width: 100%;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.92rem;
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

  .path-picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .merge-conflict-list {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 320px;
    overflow: auto;
  }

  .merge-conflict-item {
    padding: 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--bg-base);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .merge-conflict-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .merge-choice-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
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
    .shell-dialog-grid,
    .merge-choice-row,
    .path-picker-row {
      grid-template-columns: 1fr;
    }

    .field-span-2 {
      grid-column: span 1;
    }
  }
</style>
