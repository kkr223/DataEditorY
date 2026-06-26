<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { activeTab } from '$lib/stores/db';
  import { getSelectedCardIds } from '$lib/stores/editor.svelte';
  import { parseCachedFiltersJson, queryCardsByFiltersInTab } from '$lib/stores/search';
  import type { AssetCheckResponse } from '$lib/native/assetApi';
  import { startTask } from '$lib/native/taskApi';
  import { appendWorkspaceTaskHistory } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

  type Target = 'selection' | 'filter';

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  let target = $state<Target>('selection');
  let isRunning = $state(false);
  let result = $state<AssetCheckResponse | null>(null);

  async function resolveCardIds() {
    const tab = get(activeTab);
    if (!tab) return [];
    if (target === 'selection') return getSelectedCardIds();
    const cards = await queryCardsByFiltersInTab(tab.id, parseCachedFiltersJson(tab.cachedFilters));
    return cards.map((card) => card.code);
  }

  async function runCheck() {
    const tab = get(activeTab);
    if (!tab) return;
    isRunning = true;
    try {
      result = await startTask({
        kind: 'asset.check',
        cdbPath: tab.path,
        cardIds: await resolveCardIds(),
      }) as AssetCheckResponse;
      appendWorkspaceTaskHistory({
        kind: 'asset.check',
        label: $_('asset_check.title'),
        summary: {
          checked: result.checked,
          missingImages: result.missingImages,
          missingScripts: result.missingScripts,
        },
      });
    } finally {
      isRunning = false;
    }
  }
</script>

{#if open}
  <div class="dialog-backdrop" role="presentation" onclick={onClose}>
    <div
      class="asset-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={$_('asset_check.title')}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === 'Escape') onClose(); }}
    >
      <header>
        <div>
          <h2>{$_('asset_check.title')}</h2>
          <p>{$_('asset_check.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={onClose}>×</button>
      </header>

      <div class="target-row">
        <label><input type="radio" bind:group={target} value="selection" /> {$_('batch_cdb.target_selection')}</label>
        <label><input type="radio" bind:group={target} value="filter" /> {$_('batch_cdb.target_filter')}</label>
      </div>

      {#if result}
        <section class="summary">
          <div>
            <span>{$_('asset_check.checked')}</span>
            <strong>{result.checked}</strong>
          </div>
          <div>
            <span>{$_('asset_check.missing_images')}</span>
            <strong>{result.missingImages}</strong>
          </div>
          <div>
            <span>{$_('asset_check.missing_scripts')}</span>
            <strong>{result.missingScripts}</strong>
          </div>
        </section>

        <div class="missing-list">
          {#each result.missing.slice(0, 300) as item}
            <div class="missing-row">
              <strong>{item.cardId}</strong>
              <span class:bad={item.imageMissing}>{item.imageMissing ? $_('asset_check.image_missing') : $_('asset_check.image_ok')}</span>
              <span class:bad={item.scriptMissing}>{item.scriptMissing ? $_('asset_check.script_missing') : $_('asset_check.script_ok')}</span>
            </div>
          {/each}
          {#if result.missing.length > 300}
            <p>{$_('asset_check.truncated', { values: { count: String(result.missing.length - 300) } })}</p>
          {/if}
        </div>
      {/if}

      <footer>
        <button type="button" class="secondary-action" onclick={onClose}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="primary-action" onclick={() => void runCheck()} disabled={isRunning}>
          {isRunning ? '...' : $_('asset_check.run')}
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

  .asset-dialog {
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
  .missing-row {
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

  p,
  label {
    color: var(--text-secondary);
  }

  .close-btn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: var(--control-radius);
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  .target-row,
  .summary {
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .summary div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .summary span {
    color: var(--text-secondary);
    font-size: 0.8rem;
  }

  .missing-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 360px;
    overflow: auto;
  }

  .missing-row {
    justify-content: space-between;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  .missing-row span {
    color: var(--text-secondary);
  }

  .missing-row .bad {
    color: var(--state-danger-fg);
    font-weight: 700;
  }

  footer {
    justify-content: flex-end;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
  }

  .primary-action,
  .secondary-action {
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

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
