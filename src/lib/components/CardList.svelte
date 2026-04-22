<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { isDbLoaded } from '$lib/stores/db';
  import { readTextFile } from '$lib/infrastructure/tauri/commands';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import {
    clearSearchError,
    editorState,
    getAllCards,
    getTotalCards,
    handleSearch,
    handleReset,
    selectCardRange,
    setSingleSelectedCard,
    toggleCardSelection
  } from '$lib/stores/editor.svelte';
  import { getCardTypeKey, RACE_OPTIONS } from '$lib/utils/card';
  import { SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';
  import { APP_SHORTCUT_EVENT, dispatchAppShortcut } from '$lib/utils/shortcuts';
  import { disableAutofill } from '$lib/actions/disableAutofill';

  const PAGE_SIZE = 50;
  const RACE_FILTER_OPTIONS = RACE_OPTIONS
    .filter((option) => option.value !== 0 && option.key)
    .map((option) => ({
      value: option.key!.replace('search.races.', ''),
      key: option.key!,
    }));

  let pageCards = $derived(getAllCards());
  let totalCards = $derived(getTotalCards());
  let totalPages = $derived(Math.max(1, Math.ceil(totalCards / PAGE_SIZE)));

  let hasActiveFilters = $derived(
    editorState.searchFilters.id !== '' ||
    editorState.searchFilters.desc !== '' ||
    editorState.searchFilters.nameOrDesc !== '' ||
    editorState.searchFilters.imageFolderPath !== '' ||
    editorState.searchFilters.deckText !== '' ||
    editorState.searchFilters.rule !== '' ||
    editorState.searchFilters.atkMin !== '' ||
    editorState.searchFilters.atkMax !== '' ||
    editorState.searchFilters.defMin !== '' ||
    editorState.searchFilters.defMax !== '' ||
    editorState.searchFilters.type !== '' ||
    editorState.searchFilters.subtype !== '' ||
    editorState.searchFilters.attribute !== '' ||
    editorState.searchFilters.race !== '' ||
    editorState.searchFilters.setcode1 !== '' ||
    editorState.searchFilters.setcode2 !== '' ||
    editorState.searchFilters.setcode3 !== '' ||
    editorState.searchFilters.setcode4 !== ''
  );

  let selectedIdsSet = $derived(new Set(editorState.selectedIds));

  function toggleFilter() {
    editorState.isFilterOpen = !editorState.isFilterOpen;
  }

  function closeFilter() {
    editorState.isFilterOpen = false;
  }

  function goToPage(page: number) {
    const nextPage = Math.max(1, Math.min(page, totalPages));
    if (nextPage === editorState.currentPage) return;
    editorState.currentPage = nextPage;
    void handleSearch(true);
  }

  let jumpPage = $state('');
  function handleJumpPage() {
    const p = parseInt(jumpPage);
    if (!isNaN(p)) goToPage(p);
    jumpPage = '';
  }

  async function runSearch() {
    const ok = await handleSearch(false, true);
    if (ok) {
      closeFilter();
    }
  }

  async function handleResetAll() {
    await handleReset();
    dispatchAppShortcut('new-card');
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      void runSearch();
    }
  }

  async function pickImageFolder() {
    const selected = await tauriBridge.open({
      directory: true,
      multiple: false,
    });
    if (!selected || typeof selected !== 'string') {
      return;
    }

    editorState.searchFilters.imageFolderPath = selected;
    void runSearch();
  }

  async function importDeckText() {
    const selected = await tauriBridge.open({
      multiple: false,
      filters: [
        { name: 'YDK / Text', extensions: ['ydk', 'txt'] },
      ],
    });
    if (!selected || typeof selected !== 'string') {
      return;
    }

    editorState.searchFilters.deckText = await readTextFile(selected);
    void runSearch();
  }

  function handleRowClick(event: MouseEvent, code: number) {
    if (event.shiftKey) {
      selectCardRange(code, event.ctrlKey || event.metaKey);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      toggleCardSelection(code);
      return;
    }

    setSingleSelectedCard(code);
  }

  function getCardTypeTone(type: number) {
    if (type & TYPE_MAP.monster) {
      if (type & SUBTYPE_MAP.link) return 'type-link';
      if (type & SUBTYPE_MAP.xyz) return 'type-xyz';
      if (type & SUBTYPE_MAP.synchro) return 'type-synchro';
      if (type & SUBTYPE_MAP.fusion) return 'type-fusion';
      if (type & SUBTYPE_MAP.ritual) return 'type-ritual';
      if (type & SUBTYPE_MAP.pendulum) return 'type-pendulum';
      if (type & SUBTYPE_MAP.token) return 'type-token';
      if (type & SUBTYPE_MAP.effect) return 'type-effect';
      return 'type-monster';
    }

    if (type & TYPE_MAP.spell) return 'type-spell';
    if (type & TYPE_MAP.trap) return 'type-trap';
    return 'type-default';
  }

  let searchInput: HTMLInputElement | null = null;

  onMount(() => {
    const handleShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== 'focus-search') return;

      searchInput?.focus();
      searchInput?.select();
    };

    window.addEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
    return () => {
      window.removeEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
    };
  });

</script>

<section class="pane list-pane" use:disableAutofill>
  <div class="list-header-complex">
    <div class="search-row">
      <div class="search-input-wrapper">
        <input bind:this={searchInput} type="text" placeholder={$_('search.name_placeholder')} bind:value={editorState.searchFilters.nameOrDesc} onkeydown={handleSearchKeydown} />
      </div>
      <button class="btn-primary" onclick={() => void runSearch()} disabled={!$isDbLoaded} title={$_('search.title')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      </button>
      <button class="btn-secondary btn-icon" onclick={() => void handleResetAll()} disabled={!$isDbLoaded} title={$_('search.reset')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path></svg>
      </button>
      <button class="btn-secondary btn-icon" class:active={editorState.isFilterOpen} class:has-filters={hasActiveFilters} onclick={toggleFilter} title="Filters">
        {#if hasActiveFilters}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        {:else}
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        {/if}
      </button>
    </div>

    {#if editorState.isFilterOpen}
    <div class="advanced-filters">
      <div class="form-row">
        <div class="form-group">
          <label for="search-id">{$_('search.id_alias')}</label>
          <input type="text" id="search-id" bind:value={editorState.searchFilters.id} onkeydown={handleSearchKeydown} />
        </div>
        <div class="form-group flex-2">
          <label for="search-desc">{$_('search.desc')}</label>
          <input type="text" id="search-desc" bind:value={editorState.searchFilters.desc} onkeydown={handleSearchKeydown} />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group flex-2">
          <label for="search-rule">{$_('search.rule')}</label>
          <input
            type="text"
            id="search-rule"
            placeholder={$_('search.rule_placeholder')}
            bind:value={editorState.searchFilters.rule}
            class:input-error={editorState.searchError !== ''}
            oninput={() => clearSearchError()}
            onkeydown={handleSearchKeydown}
          />
          {#if editorState.searchError !== ''}
            <div class="input-error-bubble" role="alert">{editorState.searchError}</div>
          {/if}
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <span class="group-label">{$_('search.atk')}</span>
          <div class="range-inputs">
            <input type="text" inputmode="numeric" placeholder={$_('search.atk_min')} bind:value={editorState.searchFilters.atkMin} />
            <span class="range-sep">~</span>
            <input type="text" inputmode="numeric" placeholder={$_('search.atk_max')} bind:value={editorState.searchFilters.atkMax} />
          </div>
        </div>
        <div class="form-group">
          <span class="group-label">{$_('search.def')}</span>
          <div class="range-inputs">
            <input type="text" inputmode="numeric" placeholder={$_('search.def_min')} bind:value={editorState.searchFilters.defMin} />
            <span class="range-sep">~</span>
            <input type="text" inputmode="numeric" placeholder={$_('search.def_max')} bind:value={editorState.searchFilters.defMax} />
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="search-type">{$_('search.type')}</label>
          <select id="search-type" bind:value={editorState.searchFilters.type} onchange={() => { editorState.searchFilters.subtype = ''; }}>
            <option value="">{$_('search.na')}</option>
            <option value="monster">{$_('search.types.monster')}</option>
            <option value="spell">{$_('search.types.spell')}</option>
            <option value="trap">{$_('search.types.trap')}</option>
          </select>
        </div>
        <div class="form-group">
          <label for="search-subtype">{$_('search.subtype')}</label>
          <select id="search-subtype" bind:value={editorState.searchFilters.subtype}>
            <option value="">{$_('search.na')}</option>
            {#if editorState.searchFilters.type === 'monster'}
              <option value="normal">{$_('search.subtypes_monster.normal')}</option>
              <option value="effect">{$_('search.subtypes_monster.effect')}</option>
              <option value="ritual">{$_('search.subtypes_monster.ritual')}</option>
              <option value="fusion">{$_('search.subtypes_monster.fusion')}</option>
              <option value="synchro">{$_('search.subtypes_monster.synchro')}</option>
              <option value="xyz">{$_('search.subtypes_monster.xyz')}</option>
              <option value="pendulum">{$_('search.subtypes_monster.pendulum')}</option>
              <option value="link">{$_('search.subtypes_monster.link')}</option>
              <option value="spirit">{$_('search.subtypes_monster.spirit')}</option>
              <option value="union">{$_('search.subtypes_monster.union')}</option>
              <option value="gemini">{$_('search.subtypes_monster.gemini')}</option>
              <option value="tuner">{$_('search.subtypes_monster.tuner')}</option>
              <option value="flip">{$_('search.subtypes_monster.flip')}</option>
              <option value="toon">{$_('search.subtypes_monster.toon')}</option>
              <option value="token">{$_('search.subtypes_monster.token')}</option>
              <option value="spssummon">{$_('search.subtypes_monster.spssummon')}</option>
            {:else if editorState.searchFilters.type === 'spell'}
              <option value="normal">{$_('search.subtypes_spell.normal')}</option>
              <option value="quickplay">{$_('search.subtypes_spell.quickplay')}</option>
              <option value="continuous_spell">{$_('search.subtypes_spell.continuous')}</option>
              <option value="equip">{$_('search.subtypes_spell.equip')}</option>
              <option value="field">{$_('search.subtypes_spell.field')}</option>
              <option value="ritual_spell">{$_('search.subtypes_spell.ritual')}</option>
            {:else if editorState.searchFilters.type === 'trap'}
              <option value="normal">{$_('search.subtypes_trap.normal')}</option>
              <option value="continuous_trap">{$_('search.subtypes_trap.continuous')}</option>
              <option value="counter">{$_('search.subtypes_trap.counter')}</option>
            {/if}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="search-attribute">{$_('search.attribute')}</label>
          <select id="search-attribute" bind:value={editorState.searchFilters.attribute}>
            <option value="">{$_('search.na')}</option>
            <option value="light">{$_('search.attributes.light')}</option>
            <option value="dark">{$_('search.attributes.dark')}</option>
            <option value="water">{$_('search.attributes.water')}</option>
            <option value="fire">{$_('search.attributes.fire')}</option>
            <option value="earth">{$_('search.attributes.earth')}</option>
            <option value="wind">{$_('search.attributes.wind')}</option>
            <option value="divine">{$_('search.attributes.divine')}</option>
          </select>
        </div>
        <div class="form-group">
          <label for="search-race">{$_('search.race')}</label>
          <select id="search-race" bind:value={editorState.searchFilters.race}>
            <option value="">{$_('search.na')}</option>
            {#each RACE_FILTER_OPTIONS as r}
              <option value={r.value}>{$_(r.key)}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="form-group">
        <span class="group-label">{$_('search.setcodes')}</span>
        <div class="setcode-search-grid">
          {#each Array.from({ length: 4 }, (_, i) => i) as idx}
            <div class="setcode-search-input">
              <span class="setcode-prefix">0x</span>
              <input
                type="text"
                value={
                  idx === 0 ? editorState.searchFilters.setcode1 :
                  idx === 1 ? editorState.searchFilters.setcode2 :
                  idx === 2 ? editorState.searchFilters.setcode3 :
                  editorState.searchFilters.setcode4
                }
                oninput={(event) => {
                  const value = (event.target as HTMLInputElement).value;
                  if (idx === 0) editorState.searchFilters.setcode1 = value;
                  else if (idx === 1) editorState.searchFilters.setcode2 = value;
                  else if (idx === 2) editorState.searchFilters.setcode3 = value;
                  else editorState.searchFilters.setcode4 = value;
                }}
                maxlength="4"
                placeholder="0000"
              />
            </div>
          {/each}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group flex-2">
          <label for="search-image-folder">{$_('search.image_folder')}</label>
          <div class="source-input-row">
            <input
              type="text"
              id="search-image-folder"
              bind:value={editorState.searchFilters.imageFolderPath}
              placeholder={$_('search.image_folder_placeholder')}
            />
            <button class="btn-secondary source-picker" type="button" onclick={() => void pickImageFolder()}>
              {$_('search.pick_folder')}
            </button>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group flex-2">
          <label for="search-deck-text">{$_('search.deck_text')}</label>
          <div class="source-textarea-actions">
            <textarea
              id="search-deck-text"
              rows="5"
              bind:value={editorState.searchFilters.deckText}
              placeholder={$_('search.deck_text_placeholder')}
            ></textarea>
            <button class="btn-secondary source-picker" type="button" onclick={() => void importDeckText()}>
              {$_('search.import_ydk')}
            </button>
          </div>
        </div>
      </div>

      <div class="filter-actions">
        <button class="btn-secondary" onclick={closeFilter}>{$_('search.collapse')}</button>
      </div>
    </div>
    {/if}

    <div class="results-stats">
      <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
        {$_('results.title')} <span class="badge" style="margin-left: 4px;">{totalCards}</span>
      </span>
    </div>
  </div>

  <div class="table-container">
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 80px;">{$_('results.id')}</th>
          <th>{$_('results.name')}</th>
          <th style="width: 70px;">{$_('results.type')}</th>
        </tr>
      </thead>
      <tbody>
        {#each pageCards as card (card.code)}
          <tr
            class:selected={selectedIdsSet.has(card.code)}
            class:primary-selected={editorState.selectedId === card.code}
            onclick={(event) => handleRowClick(event, card.code)}
          >
            <td class="id-col">{card.code}</td>
            <td class={`name-col ${getCardTypeTone(card.type)}`}>{card.name}</td>
            <td class={`type-col ${getCardTypeTone(card.type)}`}>{$_(getCardTypeKey(card.type))}</td>
          </tr>
        {/each}
        {#if totalCards === 0}
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
              {$_('editor.no_card')}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Pagination Bar -->
  {#if totalCards > 0}
  <div class="pagination-bar">
    <button class="page-btn" onclick={() => goToPage(1)} disabled={editorState.currentPage === 1} aria-label="First page">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
    </button>
    <button class="page-btn" onclick={() => goToPage(editorState.currentPage - 1)} disabled={editorState.currentPage === 1} aria-label="Previous page">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <span class="page-info">{editorState.currentPage} / {totalPages}</span>
    <button class="page-btn" onclick={() => goToPage(editorState.currentPage + 1)} disabled={editorState.currentPage === totalPages} aria-label="Next page">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    <button class="page-btn" onclick={() => goToPage(totalPages)} disabled={editorState.currentPage === totalPages} aria-label="Last page">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
    </button>
    <span class="page-divider"></span>
    <input type="number" class="page-jump-input" bind:value={jumpPage} placeholder="#" min="1" max={totalPages} onkeydown={(e) => e.key === 'Enter' && handleJumpPage()} />
    <button class="page-btn page-go" onclick={handleJumpPage} aria-label="Go to page">{$_('search.go')}</button>
  </div>
  {/if}
</section>

<style>
  .pane { display: flex; flex-direction: column; height: 100%; border-right: 1px solid var(--border-color); }
  .list-pane { flex: 0 0 23rem; min-width: 23rem; max-width: 23rem; background-color: var(--bg-surface); }
  .list-header-complex { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-color); position: relative; z-index: 20; }
  .search-row { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); }
  .search-input-wrapper { flex: 1; }
  .search-input-wrapper input { width: 100%; margin: 0; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: var(--control-radius); background: var(--bg-base); color: var(--text-primary); }
  .search-input-wrapper input:focus { border-color: var(--accent-primary); outline: none; }
  
  .advanced-filters {
    position: absolute;
    top: calc(100% - 1px);
    left: var(--spacing-md);
    right: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    box-shadow: var(--shadow-popover);
    max-height: calc(100vh - 120px);
    overflow-y: auto;
    z-index: 100;
  }
  .results-stats { padding: var(--spacing-xs) var(--spacing-md); background-color: var(--bg-surface-active); border-top: 1px solid var(--border-color); }
  .badge { background: var(--bg-surface-active); color: var(--text-secondary); padding: 2px 8px; border-radius: var(--control-radius-pill); font-size: 0.8rem; font-weight: 500; }

  /* Form */
  .form-group { margin-bottom: var(--spacing-sm); display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; gap: var(--spacing-sm); }
  .form-row .form-group { flex: 1; }
  .flex-2 { flex: 2 !important; }
  label, .group-label { font-size: 0.86rem; color: var(--text-secondary); font-weight: 600; }
  input, select { width: 100%; background-color: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--control-radius); padding: 0.3rem 0.55rem; font-size: 0.92rem; transition: all 0.2s; }
  textarea { width: 100%; min-height: 6.5rem; resize: vertical; background-color: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--control-radius); padding: 0.45rem 0.55rem; font-size: 0.92rem; transition: all 0.2s; }
  input:focus, select:focus { border-color: var(--accent-primary); box-shadow: var(--focus-ring); outline: none; }
  textarea:focus { border-color: var(--accent-primary); box-shadow: var(--focus-ring); outline: none; }
  .input-error { border-color: var(--state-danger-fg); box-shadow: 0 0 0 1px color-mix(in srgb, var(--state-danger-fg) 20%, transparent); }
  .source-input-row { display: flex; gap: var(--spacing-sm); }
  .source-textarea-actions { display: flex; flex-direction: column; gap: var(--spacing-sm); }
  .source-picker { flex: 0 0 auto; align-self: flex-start; }
  .input-error-bubble {
    margin-top: 0.2rem;
    padding: 0.45rem 0.6rem;
    border-radius: var(--control-radius);
    background: var(--state-danger-soft-bg);
    border: 1px solid var(--state-danger-soft-border);
    color: var(--state-danger-fg);
    font-size: 0.82rem;
    line-height: 1.35;
  }

  /* Buttons */
  button { font-size: 0.9rem; font-weight: 600; padding: 0.38rem 0.7rem; border-radius: var(--control-radius); display: inline-flex; align-items: center; justify-content: center; gap: var(--spacing-sm); transition: all 0.2s; cursor: pointer; border: none; }
  .btn-primary { background-color: var(--accent-primary); color: white; }
  .btn-primary:hover { background-color: var(--accent-primary-hover); }
  .btn-secondary { background-color: var(--bg-surface-active); color: var(--text-primary); }
  .btn-secondary:hover { background-color: var(--bg-surface-hover); }
  .btn-icon { padding: var(--spacing-sm) !important; border: 1px solid transparent; }
  .btn-icon.active {
    background-color: var(--bg-surface-hover);
    color: var(--text-primary);
    border-color: var(--border-color);
  }
  .btn-icon.has-filters {
    color: var(--accent-primary);
    border-color: var(--accent-primary);
  }
  .btn-icon.active.has-filters {
    background-color: color-mix(in srgb, var(--accent-primary) 14%, var(--bg-surface-hover));
    color: var(--accent-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 55%, var(--border-color));
  }
  .filter-actions {
    margin-top: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--spacing-sm);
  }

  /* Table */
  .table-container { flex: 1; overflow: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
  .data-table th { position: sticky; top: 0; background-color: var(--bg-surface); color: var(--text-secondary); font-weight: 500; text-align: left; padding: var(--spacing-xs) var(--spacing-sm); border-bottom: 1px solid var(--border-color); z-index: 10; }
  .data-table td { padding: var(--spacing-xs) var(--spacing-sm); border-bottom: 1px solid var(--border-color); }
  .data-table tbody tr { cursor: pointer; transition: background-color 0.1s; }
  .data-table tbody tr:hover { background-color: var(--bg-surface-hover); }
  .data-table tbody tr.selected { background-color: rgba(59, 130, 246, 0.15); border-left: 2px solid var(--accent-primary); }
  .data-table tbody tr.selected td:first-child { padding-left: calc(var(--spacing-sm) - 2px); }
  .data-table tbody tr.primary-selected { background-color: rgba(59, 130, 246, 0.22); }
  .id-col { color: var(--text-secondary); font-variant-numeric: tabular-nums; font-size: 0.86rem; }
  .name-col {
    font-weight: 500;
    transition: color 0.12s ease;
  }
  .type-col {
    font-size: 0.84rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }
  .type-default { color: var(--card-list-type-default); }
  .type-monster { color: var(--card-list-type-monster); }
  .type-effect { color: var(--card-list-type-effect); }
  .type-ritual { color: var(--card-list-type-ritual); }
  .type-fusion { color: var(--card-list-type-fusion); }
  .type-synchro { color: var(--card-list-type-synchro); }
  .type-xyz { color: var(--card-list-type-xyz); }
  .type-link { color: var(--card-list-type-link); }
  .type-pendulum { color: var(--card-list-type-pendulum); }
  .type-token { color: var(--card-list-type-token); }
  .type-spell { color: var(--card-list-type-spell); }
  .type-trap { color: var(--card-list-type-trap); }

  /* Pagination */
  .pagination-bar { display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-md); border-top: 1px solid var(--border-color); background-color: var(--bg-surface); flex-shrink: 0; }
  .page-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0 !important; border-radius: var(--control-radius); background: var(--bg-surface-active); color: var(--text-secondary); border: 1px solid var(--border-color); cursor: pointer; transition: all 0.15s; }
  .page-btn:hover:not(:disabled) { background: var(--bg-surface-hover); color: var(--text-primary); }
  .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .page-info { font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; font-variant-numeric: tabular-nums; min-width: 60px; text-align: center; }
  .page-divider { width: 1px; height: 20px; background: var(--border-color); margin: 0 var(--spacing-xs); }
  .page-jump-input { width: 3.4rem !important; height: 1.9rem; text-align: center; font-size: 0.9rem !important; padding: 0.15rem 0.25rem !important; }
  .page-jump-input::-webkit-inner-spin-button, .page-jump-input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .page-go { width: auto !important; padding: 0 0.6rem !important; font-size: 0.88rem; font-weight: 600; }

  /* Range Inputs */
  .range-inputs { display: flex; align-items: center; gap: 4px; }
  .range-inputs input { flex: 1; min-width: 0; }
  .range-inputs input::-webkit-inner-spin-button,
  .range-inputs input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .range-inputs input {
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .range-sep { color: var(--text-secondary); font-weight: 600; flex-shrink: 0; }
  .setcode-search-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--spacing-sm); }
  .setcode-search-input {
    display: flex;
    align-items: center;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    overflow: hidden;
  }
  .setcode-search-input:focus-within {
    border-color: var(--accent-primary);
    box-shadow: var(--focus-ring);
  }
  .setcode-prefix {
    padding: 0 0.45rem;
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 0.84rem;
    border-right: 1px solid var(--border-color);
    background: var(--bg-surface);
  }
  .setcode-search-input input {
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0.3rem 0.45rem;
    font-family: monospace;
  }
  .setcode-search-input input:focus {
    box-shadow: none;
  }

</style>
