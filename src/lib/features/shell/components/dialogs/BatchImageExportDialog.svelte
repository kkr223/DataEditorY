<script lang="ts">
  import { onDestroy } from 'svelte';
  import { documentRuntime } from '#lib/platform/appRuntime.ts';
  import { appSettingsState } from '#lib/stores/appSettings.svelte.ts';
  import { commitWorkspaceCardDraft } from '#lib/modules/card/workbench/cardDraftWorkspaceState.svelte.ts';
  import { isCurrentMetadataPath, workspaceMetadataState, captureWorkspaceMetadataScope } from '#lib/features/workspace-metadata/state.svelte.ts';
  import { writeErrorLog } from '#lib/utils/errorLog.ts';
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { activeTab } from '#lib/stores/db.ts';
  import { getSelectedCardIds } from '#lib/stores/editor.svelte.ts';
  import { getCardsByIdsInTab } from '#lib/stores/cardOperations.ts';
  import { parseCachedFiltersJson, queryCardsByFiltersInTab } from '#lib/stores/search.ts';
  import { showToast } from '#lib/stores/toast.svelte.ts';
  import { tauriBridge } from '#lib/infrastructure/tauri/index.ts';
  import type { CardDataEntry } from '#lib/types/index.ts';
  import {
    CARD_IMAGE_COPYRIGHT_OPTIONS,
    CARD_IMAGE_LANGUAGE_OPTIONS,
    CARD_IMAGE_LASER_OPTIONS,
    CARD_IMAGE_RARE_OPTIONS,
    type CardImageLanguage,
  } from '#lib/features/card-image/layout.ts';
  import {
    findBatchCardArtPath,
    type BatchCardImageExportResult,
    type BatchCardImagePreset,
  } from '#lib/features/card-image/exporter.ts';
  import { startTask } from '#lib/native/taskApi.ts';
  import {
    getCardGroupById,
    getCardGroups,
    getCardImageDocument,
    appendWorkspaceTaskHistoryForPath,
    upsertCardGroup,
  } from '#lib/modules/card/workbench/workspaceMetadataState.svelte.ts';

  type BatchTarget = 'selection' | 'filter' | 'group';

  type PreviewItem = {
    card: CardDataEntry;
    artPath: string | null;
  };

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  let target = $state<BatchTarget>('selection');
  let selectedGroupId = $state('');
  let groupName = $state('');
  let artDir = $state('');
  let outputDir = $state('');
  let language = $state<CardImageLanguage>('sc');
  let rare = $state('');
  let laser = $state('');
  let copyright = $state('sc');
  let exportScalePercent = $state(43);
  let overwrite = $state(true);
  let usePerCardOverrides = $state(true);
  let isRunning = $state(false);
  let progress = $state({ current: 0, total: 0 });
  let preview = $state<{
    inputKey: string;
    cdbPath: string;
    targetCount: number;
    matchedCount: number;
    missingCount: number;
    sample: PreviewItem[];
    items: PreviewItem[];
  } | null>(null);

  let requestSequence = 0;
  let disposed = false;
  onDestroy(() => {
    disposed = true;
    requestSequence += 1;
  });

  function inputKey() {
    const tab = $activeTab;
    return JSON.stringify([
      open, tab?.id, tab?.path, documentRuntime.getDocument(tab?.id ?? '')?.revision,
      target, selectedGroupId, getSelectedCardIds(), getCardGroupById(selectedGroupId)?.cardIds,
      tab?.cachedFilters, artDir, outputDir, buildPreset(), overwrite,
      appSettingsState.values.cardImageMaxSizeKb, workspaceMetadataState.metadata?.image,
    ]);
  }

  $effect(() => {
    const key = inputKey();
    if (preview && preview.inputKey !== key) preview = null;
  });

  $effect(() => {
    if (!open) {
      requestSequence += 1;
      preview = null;
    }
  });

  function closeDialog() {
    if (isRunning) return;
    requestSequence += 1;
    preview = null;
    onClose();
  }

  function getOptionText(option: { label?: string; labelKey?: string; value: string }) {
    if (option.labelKey) return $_(option.labelKey);
    return option.label ?? (option.value || $_('search.na'));
  }

  function buildPreset(): BatchCardImagePreset {
    return {
      language,
      rare,
      laser,
      copyright,
      exportScalePercent: Math.min(100, Math.max(10, Number(exportScalePercent) || 43)),
      usePerCardOverrides,
    };
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
    const isCurrent = captureWorkspaceMetadataScope();
    const cards = await resolveTargetCards();
    if (!isCurrent() || disposed) return;
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
    preview = null;
    showToast($_('card_group.saved'), 'success');
  }

  async function pickArtDir() {
    const selected = await tauriBridge.open({
      directory: true,
      multiple: false,
      title: $_('batch_image_export.pick_art_dir') as string,
    });
    if (typeof selected === 'string') {
      artDir = selected;
      preview = null;
    }
  }

  async function pickOutputDir() {
    const selected = await tauriBridge.open({
      directory: true,
      multiple: false,
      title: $_('batch_image_export.pick_output_dir') as string,
    });
    if (typeof selected === 'string') {
      outputDir = selected;
      preview = null;
    }
  }

  async function buildPreview() {
    if (isRunning) return;
    const tab = get(activeTab);
    if (!tab) return;
    if (!artDir.trim()) {
      showToast($_('batch_image_export.art_dir_required'), 'error');
      return;
    }
    const sequence = ++requestSequence;
    const isOwner = () => !disposed && open && sequence === requestSequence
      && get(activeTab)?.id === tab.id && get(activeTab)?.path === tab.path;
    isRunning = true;
    preview = null;
    progress = { current: 0, total: 0 };
    try {
      if (!(await commitWorkspaceCardDraft(tab.id)) || !isOwner()) return;
      if ((usePerCardOverrides || target === 'group') && !isCurrentMetadataPath(tab.path)) throw new Error('Workspace metadata is not ready');
      const key = inputKey();
      const sourceArtDir = artDir.trim();
      const cards = await resolveTargetCards();
      const items: PreviewItem[] = [];
      progress = { current: 0, total: cards.length };
      for (const card of cards) {
        if (!isOwner() || inputKey() !== key) return;
        items.push({ card, artPath: await findBatchCardArtPath(sourceArtDir, card.code) });
        progress = { current: items.length, total: cards.length };
      }
      if (!isOwner() || inputKey() !== key) return;
      const matchedCount = items.filter((item) => item.artPath).length;
      preview = {
        inputKey: key, cdbPath: tab.path, targetCount: items.length, matchedCount,
        missingCount: items.length - matchedCount, sample: items.slice(0, 10), items,
      };
    } catch (error) {
      if (isOwner()) showToast($_('batch_image_export.preview_failed'), 'error');
      void writeErrorLog({ source: 'batch-image.preview', error, extra: { cdbPath: tab.path } });
    } finally {
      if (!disposed) {
        isRunning = false;
        progress = { current: 0, total: 0 };
      }
    }
  }

  async function applyExport() {
    if (isRunning || !preview) return;
    const plan = preview;
    if (plan.inputKey !== inputKey()) {
      preview = null;
      return;
    }
    if (!outputDir.trim()) {
      showToast($_('batch_image_export.output_dir_required'), 'error');
      return;
    }
    const matched = plan.items.filter((item): item is PreviewItem & { artPath: string } => Boolean(item.artPath));
    if (matched.length === 0) {
      showToast($_('batch_image_export.no_matched_art'), 'error');
      return;
    }
    // Capture all per-card configuration before any prompt, task or workspace switch.
    const preset = buildPreset();
    const destination = outputDir.trim();
    const sourceArtDir = artDir.trim();
    const allowOverwrite = overwrite;
    const maxSizeKb = appSettingsState.values.cardImageMaxSizeKb ?? 0;
    const jobs = matched.map((item) => ({
      kind: 'batch.image.export-card',
      card: structuredClone($state.snapshot(item.card)), artPath: item.artPath,
      outputDir: destination, cdbPath: plan.cdbPath, preset: { ...preset },
      perCardDocument: usePerCardOverrides ? structuredClone($state.snapshot(getCardImageDocument(item.card.code))) : null,
      overwrite: allowOverwrite, maxSizeKb,
    }));
    const sequence = ++requestSequence;
    isRunning = true;
    let success = 0;
    let skipped = 0;
    let failed = 0;
    try {
      const confirmed = await tauriBridge.ask(
        $_('batch_image_export.confirm_message', {
          values: { count: String(matched.length), missing: String(plan.missingCount) },
        }) as string,
        { title: $_('batch_image_export.title') as string, kind: 'warning' },
      );
      if (!confirmed || disposed || sequence !== requestSequence || inputKey() !== plan.inputKey) return;
      progress = { current: 0, total: jobs.length };
      for (const job of jobs) {
        if (disposed || sequence !== requestSequence) break;
        try {
          const result = await startTask(job) as BatchCardImageExportResult;
          if (result.error) throw new Error(result.error);
          if (result.skipped) skipped += 1;
          else success += 1;
        } catch (error) {
          failed += 1;
          void writeErrorLog({ source: 'batch-image.export', error, extra: { cdbPath: plan.cdbPath, cardCode: job.card.code } });
        } finally {
          if (!disposed) progress = { current: progress.current + 1, total: jobs.length };
        }
      }
      await appendWorkspaceTaskHistoryForPath(plan.cdbPath, {
        kind: 'batch.image.export', label: $_('batch_image_export.title'),
        summary: { targetCount: plan.targetCount, matchedCount: jobs.length, success, skipped, failed,
          artDir: sourceArtDir, outputDir: destination },
      });
      if (disposed || !open || sequence !== requestSequence) return;
      showToast($_('batch_image_export.done_message', {
        values: { success: String(success), skipped: String(skipped), failed: String(failed) },
      }), failed > 0 ? 'error' : 'success');
      if (failed === 0) {
        preview = null;
        onClose();
      }
    } catch (error) {
      void writeErrorLog({ source: 'batch-image.export', error, extra: { cdbPath: plan.cdbPath } });
      if (!disposed) showToast($_('batch_image_export.export_failed'), 'error');
    } finally {
      if (!disposed) {
        isRunning = false;
        progress = { current: 0, total: 0 };
      }
    }
  }

</script>

{#if open}
  <div class="dialog-backdrop" role="presentation">
    <div
      class="batch-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={$_('batch_image_export.title')}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === 'Escape') closeDialog(); }}
    >
      <header>
        <div>
          <h2>{$_('batch_image_export.title')}</h2>
          <p>{$_('batch_image_export.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={closeDialog} disabled={isRunning}>×</button>
      </header>

      <fieldset disabled={isRunning}>
      <div class="target-row">
        <label>
          <input type="radio" bind:group={target} value="selection" onchange={() => { preview = null; }} />
          {$_('batch_cdb.target_selection')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="filter" onchange={() => { preview = null; }} />
          {$_('batch_cdb.target_filter')}
        </label>
        <label>
          <input type="radio" bind:group={target} value="group" onchange={() => { preview = null; }} />
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
        <select bind:value={selectedGroupId} onchange={() => { preview = null; }}>
          <option value="">{$_('card_group.no_group')}</option>
          {#each getCardGroups() as group}
            <option value={group.id}>{group.name} · {group.cardIds.length}</option>
          {/each}
        </select>
      </div>

      <div class="path-grid">
        <label>
          <span>{$_('batch_image_export.art_dir')}</span>
          <div class="path-row">
            <input type="text" bind:value={artDir} oninput={() => { preview = null; }} />
            <button type="button" class="secondary-action" onclick={() => void pickArtDir()}>{$_('nav.open')}</button>
          </div>
        </label>
        <label>
          <span>{$_('batch_image_export.output_dir')}</span>
          <div class="path-row">
            <input type="text" bind:value={outputDir} oninput={() => { preview = null; }} />
            <button type="button" class="secondary-action" onclick={() => void pickOutputDir()}>{$_('nav.open')}</button>
          </div>
        </label>
      </div>

      <div class="preset-grid">
        <label>
          <span>{$_('editor.card_image_language')}</span>
          <select bind:value={language} onchange={() => { preview = null; }}>
            {#each CARD_IMAGE_LANGUAGE_OPTIONS as option}
              <option value={option.value}>{getOptionText(option)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{$_('editor.card_image_rarity')}</span>
          <select bind:value={rare} onchange={() => { preview = null; }}>
            {#each CARD_IMAGE_RARE_OPTIONS as option}
              <option value={option.value}>{getOptionText(option)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{$_('editor.card_image_laser')}</span>
          <select bind:value={laser} onchange={() => { preview = null; }}>
            {#each CARD_IMAGE_LASER_OPTIONS as option}
              <option value={option.value}>{getOptionText(option)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{$_('editor.card_image_copyright')}</span>
          <select bind:value={copyright} onchange={() => { preview = null; }}>
            {#each CARD_IMAGE_COPYRIGHT_OPTIONS as option}
              <option value={option.value}>{getOptionText(option)}</option>
            {/each}
          </select>
        </label>
        <label>
          <span>{$_('batch_image_export.export_scale')}</span>
          <input type="number" min="10" max="100" step="1" bind:value={exportScalePercent} onchange={() => { preview = null; }} />
        </label>
      </div>

      <div class="options-row">
        <label>
          <input type="checkbox" bind:checked={usePerCardOverrides} onchange={() => { preview = null; }} />
          {$_('batch_image_export.use_per_card_overrides')}
        </label>
        <label>
          <input type="checkbox" bind:checked={overwrite} />
          {$_('batch_image_export.overwrite')}
        </label>
      </div>

      </fieldset>

      {#if progress.total > 0}
        <div class="progress">
          <div style={`width:${Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%`}></div>
          <span>{progress.current} / {progress.total}</span>
        </div>
      {/if}

      {#if preview}
        <div class="preview">
          <strong>{$_('batch_image_export.preview_summary', {
            values: {
              target: String(preview.targetCount),
              matched: String(preview.matchedCount),
              missing: String(preview.missingCount),
            },
          })}</strong>
          {#if preview.sample.length}
            <ul>
              {#each preview.sample as item}
                <li class:missing={!item.artPath}>
                  {item.card.code} · {item.card.name} · {item.artPath ? $_('batch_image_export.matched') : $_('batch_image_export.missing')}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <footer>
        <button type="button" class="secondary-action" onclick={closeDialog} disabled={isRunning}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="secondary-action" onclick={() => void buildPreview()} disabled={isRunning}>
          {isRunning ? '...' : $_('batch_cdb.preview')}
        </button>
        <button type="button" class="primary-action" onclick={() => void applyExport()} disabled={isRunning || !preview || preview.matchedCount === 0}>
          {$_('batch_image_export.export')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; display: flex; flex-direction: column; gap: 14px; }

  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--dialog-backdrop);
    backdrop-filter: blur(4px);
  }

  .batch-dialog {
    width: min(820px, 100%);
    max-height: min(860px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--border-color);
    border-radius: var(--dialog-radius);
    background: var(--bg-surface);
    box-shadow: var(--dialog-shadow);
    color: var(--text-primary);
    overflow: auto;
  }

  header,
  footer,
  .target-row,
  .options-row,
  .group-create-row,
  .path-row {
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
    font-size: var(--text-lg);
  }

  p {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    border: none;
    border-radius: var(--control-radius);
    background: var(--bg-surface-active);
    color: var(--text-primary);
    cursor: pointer;
  }

  .target-row,
  .options-row,
  .group-panel {
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  .group-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-create-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
    color: var(--text-secondary);
  }

  .target-row label,
  .options-row label {
    flex-direction: row;
    align-items: center;
  }

  .path-grid,
  .preset-grid {
    display: grid;
    gap: 10px;
  }

  .preset-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .path-row {
    min-width: 0;
  }

  input,
  select {
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

  li.missing {
    color: var(--danger);
  }

  .progress {
    position: relative;
    height: 28px;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  .progress div {
    height: 100%;
    background: color-mix(in srgb, var(--accent-primary) 62%, transparent);
    transition: width 0.15s ease;
  }

  .progress span {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-weight: 700;
    color: var(--text-primary);
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
    color: var(--text-on-accent);
  }

  .secondary-action {
    flex: 0 0 auto;
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 760px) {
    .preset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
