<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { activeTab } from '$lib/stores/db';
  import { getSelectedCardIds } from '$lib/stores/editor.svelte';
  import { getAllCardsInTab, getCardsByIdsInTab } from '$lib/stores/cardOperations';
  import { parseCachedFiltersJson, queryCardsByFiltersInTab } from '$lib/stores/search';
  import type { CardDataEntry, SelectOption } from '$lib/types';
  import { getPackedLevel } from '$lib/domain/card/draft';
  import { ATTRIBUTE_OPTIONS, RACE_OPTIONS, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';
  import { resolveCardImageSrc } from '$lib/services/cardImageService';
  import { writeBinaryFile } from '$lib/native/assetApi';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { showToast } from '$lib/stores/toast.svelte';
  import { writeErrorLog } from '$lib/utils/errorLog';
  import {
    appendWorkspaceTaskHistory,
    getCardGroupById,
    getCardGroups,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import {
    chunkShowcaseCards,
    getShowcaseLinkCount,
    getShowcaseLinkMarkers,
    getShowcaseTypeKeys,
    renderCardShowcasePage,
    type CardShowcaseItem,
  } from '$lib/features/shell/cardShowcaseRenderer';

  type ShowcaseTarget = 'cdb' | 'selection' | 'filter' | 'group';

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  let target = $state<ShowcaseTarget>('cdb');
  let selectedGroupId = $state('');
  let outputDir = $state('');
  let cardsPerImage = $state(10);
  let removeAttribution = $state(false);
  let customAttributionMarker = $state('');
  let headText = $state('');
  let isRunning = $state(false);
  let progress = $state({ current: 0, total: 0 });

  function getOptionLabel(options: SelectOption<number>[], value: number) {
    const option = options.find((item) => item.value === value);
    return option?.key ? $_(option.key) : option?.label ?? $_('search.na');
  }

  function buildInfoLines(card: CardDataEntry) {
    const typeLabel = getShowcaseTypeKeys(card.type).map((key) => $_(key)).join('/');
    if (!(card.type & TYPE_MAP.monster)) return [typeLabel];

    const details = [
      typeLabel,
      getOptionLabel(ATTRIBUTE_OPTIONS, card.attribute),
      getOptionLabel(RACE_OPTIONS, card.race),
    ];
    const formatStat = (value: number) => value < 0 ? '?' : String(value);
    if (card.type & SUBTYPE_MAP.link) {
      const markerText = getShowcaseLinkMarkers(card.linkMarker);
      return [
        details.join(' · '),
        `ATK ${formatStat(card.attack)}  /  LINK-${getShowcaseLinkCount(card.linkMarker)}${markerText ? ` ${markerText}` : ''}`,
      ];
    }

    details.push(`${$_(card.type & SUBTYPE_MAP.xyz ? 'showcase_image.rank' : 'showcase_image.level')} ${getPackedLevel(card.level)}`);
    return [
      details.join(' · '),
      `ATK ${formatStat(card.attack)}  /  DEF ${formatStat(card.defense)}`,
    ];
  }

  async function resolveTargetCards() {
    const tab = get(activeTab);
    if (!tab) return [];
    if (target === 'selection') {
      return getCardsByIdsInTab(tab.id, getSelectedCardIds());
    }
    if (target === 'filter') {
      return queryCardsByFiltersInTab(tab.id, parseCachedFiltersJson(tab.cachedFilters));
    }
    if (target === 'group') {
      const group = getCardGroupById(selectedGroupId);
      return group ? getCardsByIdsInTab(tab.id, group.cardIds) : [];
    }
    return getAllCardsInTab(tab.id);
  }

  async function pickOutputDir() {
    const selected = await tauriBridge.open({
      directory: true,
      multiple: false,
      title: $_('showcase_image.pick_output_dir') as string,
    });
    if (typeof selected === 'string') outputDir = selected;
  }

  function getOutputBaseName(cdbPath: string) {
    return cdbPath.split(/[\\/]/).at(-1)?.replace(/\.cdb$/i, '') || 'cards';
  }

  async function generateImages() {
    const tab = get(activeTab);
    if (!tab?.path) return;
    if (!outputDir.trim()) {
      showToast($_('showcase_image.output_dir_required'), 'error');
      return;
    }

    isRunning = true;
    progress = { current: 0, total: 0 };
    try {
      const cards = await resolveTargetCards();
      if (cards.length === 0) {
        showToast($_('showcase_image.empty_target'), 'error');
        return;
      }

      const items: CardShowcaseItem[] = await Promise.all(cards.map(async (card) => ({
        card,
        imageSrc: await resolveCardImageSrc(tab.path, card.code),
        infoLines: buildInfoLines(card),
      })));
      const pages = chunkShowcaseCards(items, cardsPerImage);
      progress = { current: 0, total: pages.length };
      const stamp = new Date().toISOString().replace(/\D/g, '');
      const baseName = `${getOutputBaseName(tab.path)}-showcase-${stamp}`;

      for (const [index, page] of pages.entries()) {
        const blob = await renderCardShowcasePage(page, {
          removeAttribution,
          customAttributionMarker,
          headText,
        });
        const outputPath = await tauriBridge.join(
          outputDir,
          `${baseName}-${String(index + 1).padStart(2, '0')}.png`,
        );
        await writeBinaryFile(outputPath, Array.from(new Uint8Array(await blob.arrayBuffer())));
        progress = { current: index + 1, total: pages.length };
      }

      appendWorkspaceTaskHistory({
        kind: 'card.showcase-image',
        label: $_('showcase_image.title'),
        summary: { cardCount: cards.length, imageCount: pages.length, outputDir },
      });
      showToast($_('showcase_image.done', {
        values: { cards: String(cards.length), images: String(pages.length) },
      }), 'success');
      onClose();
    } catch (error) {
      console.error('Failed to generate card showcase images', error);
      void writeErrorLog({ source: 'shell.card-showcase-image', error });
      showToast($_('showcase_image.failed'), 'error');
    } finally {
      isRunning = false;
      progress = { current: 0, total: 0 };
    }
  }
</script>

{#if open}
  <div class="dialog-backdrop" role="presentation">
    <div
      class="showcase-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={$_('showcase_image.title')}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === 'Escape' && !isRunning) onClose(); }}
    >
      <header>
        <div>
          <h2>{$_('showcase_image.title')}</h2>
          <p>{$_('showcase_image.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={onClose} disabled={isRunning}>×</button>
      </header>

      <section class="target-panel" aria-label={$_('showcase_image.target')}>
        <label><input type="radio" bind:group={target} value="cdb" /> {$_('showcase_image.target_cdb')}</label>
        <label><input type="radio" bind:group={target} value="selection" /> {$_('batch_cdb.target_selection')}</label>
        <label><input type="radio" bind:group={target} value="filter" /> {$_('batch_cdb.target_filter')}</label>
        <label><input type="radio" bind:group={target} value="group" /> {$_('card_group.target_group')}</label>
      </section>

      {#if target === 'group'}
        <label class="field">
          <span>{$_('card_group.target_group')}</span>
          <select bind:value={selectedGroupId}>
            <option value="">{$_('card_group.no_group')}</option>
            {#each getCardGroups() as group}
              <option value={group.id}>{group.name} · {group.cardIds.length}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="settings-grid">
        <label class="field">
          <span>{$_('showcase_image.cards_per_image')}</span>
          <input type="number" min="1" max="30" step="1" bind:value={cardsPerImage} />
          <small>{$_('showcase_image.cards_per_image_hint')}</small>
        </label>
        <label class="field output-field">
          <span>{$_('showcase_image.output_dir')}</span>
          <div class="path-row">
            <input type="text" bind:value={outputDir} />
            <button type="button" class="secondary-action" onclick={() => void pickOutputDir()}>{$_('nav.open')}</button>
          </div>
        </label>
      </div>

      <label class="field">
        <span>{$_('showcase_image.head_text')}</span>
        <textarea bind:value={headText} placeholder={$_('showcase_image.head_text_placeholder')}></textarea>
        <small>{$_('showcase_image.head_text_hint')}</small>
      </label>

      <section class="attribution-panel">
        <label class="check-row">
          <input type="checkbox" bind:checked={removeAttribution} />
          <span>{$_('showcase_image.remove_attribution')}</span>
        </label>
        <p>{$_('showcase_image.remove_attribution_hint')}</p>
        {#if removeAttribution}
          <label class="field">
            <span>{$_('showcase_image.custom_marker')}</span>
            <input type="text" bind:value={customAttributionMarker} placeholder={$_('showcase_image.custom_marker_placeholder')} />
            <small>{$_('showcase_image.custom_marker_hint')}</small>
          </label>
        {/if}
      </section>

      {#if progress.total > 0}
        <div class="progress">
          <div style={`width:${Math.round((progress.current / progress.total) * 100)}%`}></div>
          <span>{progress.current} / {progress.total}</span>
        </div>
      {/if}

      <footer>
        <button type="button" class="secondary-action" onclick={onClose} disabled={isRunning}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="primary-action" onclick={() => void generateImages()} disabled={isRunning}>
          {isRunning ? $_('showcase_image.generating') : $_('showcase_image.generate')}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 24px; background: rgba(0, 0, 0, 0.48); }
  .showcase-dialog { width: min(760px, 100%); max-height: calc(100vh - 48px); display: flex; flex-direction: column; gap: 14px; overflow: auto; padding: 20px; border: 1px solid var(--border-color); border-radius: var(--control-radius-soft); background: var(--bg-surface); box-shadow: var(--shadow-popover); color: var(--text-primary); }
  header, footer, .target-panel, .path-row, .check-row { display: flex; align-items: center; gap: 10px; }
  header { justify-content: space-between; }
  h2, p { margin: 0; }
  h2 { font-size: 1.08rem; }
  header p, .attribution-panel p, small { color: var(--text-secondary); line-height: 1.45; }
  .close-btn { width: 30px; height: 30px; border: none; border-radius: var(--control-radius); background: var(--bg-surface-active); color: var(--text-primary); cursor: pointer; }
  .target-panel, .attribution-panel { padding: 12px; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); }
  .target-panel { flex-wrap: wrap; }
  .target-panel label, .check-row { flex-direction: row; align-items: center; color: var(--text-primary); }
  .settings-grid { display: grid; grid-template-columns: minmax(150px, 0.35fr) minmax(0, 1fr); gap: 12px; }
  .field, .attribution-panel { display: flex; flex-direction: column; gap: 7px; }
  .field > span { color: var(--text-secondary); font-size: 0.8rem; font-weight: 700; }
  input, select, textarea { min-width: 0; width: 100%; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); color: var(--text-primary); padding: 0.46rem 0.58rem; font: inherit; }
  textarea { min-height: 4.6rem; resize: vertical; }
  input[type='radio'], input[type='checkbox'] { width: auto; }
  .path-row input { flex: 1; }
  .progress { position: relative; height: 28px; overflow: hidden; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); }
  .progress div { height: 100%; background: color-mix(in srgb, var(--accent-primary) 62%, transparent); }
  .progress span { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 700; }
  footer { justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--border-color); }
  .primary-action, .secondary-action { border: none; border-radius: var(--control-radius); padding: 0.5rem 0.76rem; font-weight: 700; cursor: pointer; }
  .primary-action { background: var(--accent-primary); color: white; }
  .secondary-action { flex: 0 0 auto; background: var(--bg-surface-active); color: var(--text-primary); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  @media (max-width: 680px) { .settings-grid { grid-template-columns: 1fr; } }
</style>
