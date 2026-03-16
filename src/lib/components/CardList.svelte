<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { isDbLoaded } from '$lib/stores/db';
  import { editorState, getAllCards, handleSearch, handleReset } from '$lib/stores/editor.svelte';
  import { getCardTypeKey, RACE_OPTIONS } from '$lib/utils/card';

  const PAGE_SIZE = 50;
  let allCards = $derived(getAllCards());
  let totalPages = $derived(Math.max(1, Math.ceil(allCards.length / PAGE_SIZE)));
  let pageCards = $derived(allCards.slice((editorState.currentPage - 1) * PAGE_SIZE, editorState.currentPage * PAGE_SIZE));

  let hasActiveFilters = $derived(
    editorState.searchFilters.id !== '' ||
    editorState.searchFilters.desc !== '' ||
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

  function toggleFilter() {
    editorState.isFilterOpen = !editorState.isFilterOpen;
  }

  function closeFilter() {
    editorState.isFilterOpen = false;
  }

  function goToPage(page: number) {
    editorState.currentPage = Math.max(1, Math.min(page, totalPages));
  }

  let jumpPage = $state('');
  function handleJumpPage() {
    const p = parseInt(jumpPage);
    if (!isNaN(p)) goToPage(p);
    jumpPage = '';
  }

</script>

<section class="pane list-pane">
  <div class="list-header-complex">
    <div class="search-row">
      <div class="search-input-wrapper">
        <input type="text" placeholder={$_('search.name_placeholder')} bind:value={editorState.searchFilters.name} onkeydown={(e) => e.key === 'Enter' && handleSearch()} />
      </div>
      <button class="btn-primary" onclick={() => handleSearch()} disabled={!$isDbLoaded} title={$_('search.title')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
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
          <input type="text" id="search-id" bind:value={editorState.searchFilters.id} />
        </div>
        <div class="form-group flex-2">
          <label for="search-desc">{$_('search.desc')}</label>
          <input type="text" id="search-desc" bind:value={editorState.searchFilters.desc} />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <span class="group-label">{$_('search.atk')}</span>
          <div class="range-inputs">
            <input type="number" placeholder={$_('search.atk_min')} bind:value={editorState.searchFilters.atkMin} />
            <span class="range-sep">~</span>
            <input type="number" placeholder={$_('search.atk_max')} bind:value={editorState.searchFilters.atkMax} />
          </div>
        </div>
        <div class="form-group">
          <span class="group-label">{$_('search.def')}</span>
          <div class="range-inputs">
            <input type="number" placeholder={$_('search.def_min')} bind:value={editorState.searchFilters.defMin} />
            <span class="range-sep">~</span>
            <input type="number" placeholder={$_('search.def_max')} bind:value={editorState.searchFilters.defMax} />
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
            {#each RACE_OPTIONS as r}
              <option value={r.value}>{$_(r.key!)}</option>
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
      <div class="filter-actions">
        <button class="btn-secondary" onclick={handleReset}>{$_('search.reset')}</button>
        <button class="btn-secondary" onclick={closeFilter}>{$_('search.collapse')}</button>
      </div>
    </div>
    {/if}

    <div class="results-stats">
      <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
        {$_('results.title')} <span class="badge" style="margin-left: 4px;">{allCards.length}</span>
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
          <tr class:selected={editorState.selectedId === card.code} onclick={() => editorState.selectedId = card.code}>
            <td class="id-col">{card.code}</td>
            <td class="name-col">{card.name}</td>
            <td>{$_(getCardTypeKey(card.type))}</td>
          </tr>
        {/each}
        {#if allCards.length === 0}
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
  {#if allCards.length > 0}
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
  .list-pane { flex: 0 0 clamp(18rem, 23vw, 30rem); min-width: 16rem; max-width: 34rem; background-color: var(--bg-surface); }
  .list-header-complex { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-color); position: relative; z-index: 20; }
  .search-row { display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-sm) var(--spacing-md); }
  .search-input-wrapper { flex: 1; }
  .search-input-wrapper input { width: 100%; margin: 0; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-base); color: var(--text-primary); }
  .search-input-wrapper input:focus { border-color: var(--accent-primary); outline: none; }
  
  .advanced-filters {
    position: absolute;
    top: calc(100% - 1px);
    left: var(--spacing-md);
    right: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--border-radius-md);
    box-shadow: 0 16px 32px rgba(0, 0, 0, 0.28);
  }
  .results-stats { padding: var(--spacing-xs) var(--spacing-md); background-color: var(--bg-surface-active); border-top: 1px solid var(--border-color); }
  .badge { background: var(--bg-surface-active); color: var(--text-secondary); padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: 500; }

  /* Form */
  .form-group { margin-bottom: var(--spacing-sm); display: flex; flex-direction: column; gap: 4px; }
  .form-row { display: flex; gap: var(--spacing-sm); }
  .form-row .form-group { flex: 1; }
  .flex-2 { flex: 2 !important; }
  label, .group-label { font-size: 0.86rem; color: var(--text-secondary); font-weight: 600; }
  input, select { width: 100%; background-color: var(--bg-base); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--border-radius-sm); padding: 0.3rem 0.55rem; font-size: 0.92rem; transition: all 0.2s; }
  input:focus, select:focus { border-color: var(--accent-primary); box-shadow: 0 0 0 1px var(--accent-primary); outline: none; }

  /* Buttons */
  button { font-size: 0.9rem; font-weight: 600; padding: 0.38rem 0.7rem; border-radius: var(--border-radius-sm); display: inline-flex; align-items: center; justify-content: center; gap: var(--spacing-sm); transition: all 0.2s; cursor: pointer; border: none; }
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
  .id-col { color: var(--text-secondary); font-variant-numeric: tabular-nums; font-size: 0.86rem; }
  .name-col { font-weight: 500; }

  /* Pagination */
  .pagination-bar { display: flex; align-items: center; justify-content: center; gap: var(--spacing-sm); padding: var(--spacing-xs) var(--spacing-md); border-top: 1px solid var(--border-color); background-color: var(--bg-surface); flex-shrink: 0; }
  .page-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0 !important; border-radius: var(--border-radius-sm); background: var(--bg-surface-active); color: var(--text-secondary); border: 1px solid var(--border-color); cursor: pointer; transition: all 0.15s; }
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
  .range-inputs input[type='number'] {
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
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }
  .setcode-search-input:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
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

  @media (max-width: 1200px) {
    .list-pane {
      flex-basis: 16rem;
      min-width: 14rem;
    }
  }

  @media (min-width: 2560px) {
    .list-pane {
      flex-basis: 25rem;
      max-width: 36rem;
    }
    .data-table td,
    .data-table th {
      padding-top: 0.35rem;
      padding-bottom: 0.35rem;
    }
  }
</style>
