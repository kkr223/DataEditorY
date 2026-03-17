<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, locale, isLoading } from 'svelte-i18n';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { CardDataEntry } from 'ygopro-cdb-encode';
  import { openCdbFile, createCdbFile, tabs, activeTabId, closeTab, saveCdbFile, getCardById, hasUnsavedChanges, isDbLoaded, deleteCards, modifyCards, hasUndoableAction, getLastUndoLabel, undoLastOperation } from '$lib/stores/db';
  import { getCardClipboard, hasCardClipboard, setCardClipboard } from '$lib/stores/cardClipboard.svelte';
  import { clearSelection, getAllCardsMap, getSelectedCardIds, getSelectedCards, handleSearch, setSelectedCards } from '$lib/stores/editor.svelte';
  import { showToast } from '$lib/stores/toast.svelte';
  import { dispatchAppShortcut } from '$lib/utils/shortcuts';
  import Toast from '$lib/components/Toast.svelte';
  
  // initialize immediately
  setupI18n();

  let { children } = $props();
  let theme = $state<'dark' | 'light'>('dark');

  function applyTheme(next: 'dark' | 'light') {
    theme = next;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  function toggleLanguage() {
    locale.set($locale === 'en' ? 'zh' : 'en');
  }

  function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  }

  async function handleOpen() {
    await openCdbFile();
  }

  async function handleCreate() {
    await createCdbFile();
  }

  async function handleSave() {
    const ok = await saveCdbFile();
    showToast($_(ok ? 'editor.save_success' : 'editor.save_failed'), ok ? 'success' : 'error');
  }

  async function handleCloseTab(tabId: string) {
    const tab = $tabs.find((item) => item.id === tabId);
    if (!tab) return;

    if (hasUnsavedChanges(tabId)) {
      const confirmed = await ask($_('editor.unsaved_close_confirm', {
        values: { name: tab.name },
      }), {
        title: $_('editor.unsaved_close_title'),
        kind: 'warning',
      });

      if (!confirmed) return;
    }

    closeTab(tabId);
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  async function handleCopySelection() {
    const selectedCards = getSelectedCards();
    if (selectedCards.length === 0) {
      showToast($_('editor.clipboard_empty'), 'info');
      return;
    }

    setCardClipboard(selectedCards);
    showToast($_('editor.cards_copied', { values: { count: String(selectedCards.length) } }), 'success');
  }

  async function handlePasteSelection() {
    if (!$isDbLoaded) return;
    if (!hasCardClipboard()) {
      showToast($_('editor.clipboard_empty'), 'info');
      return;
    }

    const clipboardCards = getCardClipboard();
    const conflictingCards = clipboardCards.filter((card) => getCardById(card.code));
    if (conflictingCards.length > 0) {
      const shouldOverwrite = await ask($_('editor.paste_conflict_confirm', {
        values: { count: String(conflictingCards.length) },
      }), {
        title: $_('editor.paste_conflict_title'),
        kind: 'warning',
      });

      if (!shouldOverwrite) return;
    }

    const pastedCards = clipboardCards.map((card) => new CardDataEntry().fromPartial(card));
    const ok = modifyCards(pastedCards);
    if (!ok) {
      showToast($_('editor.save_failed'), 'error');
      return;
    }

    const prevSelectedIds = getSelectedCardIds();
    handleSearch(true);
    const visibleIds = pastedCards
      .map((card) => card.code)
      .filter((code) => getAllCardsMap().has(code));

    if (visibleIds.length > 0) {
      setSelectedCards(visibleIds, visibleIds[0], visibleIds[0]);
    } else if (prevSelectedIds.length === 0) {
      clearSelection();
    }

    showToast($_('editor.cards_pasted', { values: { count: String(pastedCards.length) } }), 'success');
  }

  async function handleDeleteSelection() {
    if (!$isDbLoaded) return;

    const selectedIds = getSelectedCardIds();
    if (selectedIds.length === 0) {
      showToast($_('editor.no_card_selected'), 'info');
      return;
    }

    const confirmed = await ask($_('editor.delete_selected_confirm', {
      values: { count: String(selectedIds.length) },
    }), {
      title: $_('editor.delete_selected_title'),
      kind: 'warning',
    });

    if (!confirmed) return;

    const ok = deleteCards(selectedIds);
    if (!ok) {
      showToast($_('editor.save_failed'), 'error');
      return;
    }

    handleSearch();
    showToast($_('editor.cards_deleted', { values: { count: String(selectedIds.length) } }), 'success');
  }

  async function handleUndoLastOperation() {
    if (!$isDbLoaded || !hasUndoableAction()) return;

    const lastUndoLabel = getLastUndoLabel();
    const message = $_('editor.undo_confirm', {
      values: {
        detail: lastUndoLabel ? `\n\n${$_('editor.undo_last_action', { values: { action: lastUndoLabel } })}` : '',
      },
    });
    const title = $_('editor.undo_title');

    const confirmed = await ask(message, {
      title,
      kind: 'warning',
    });

    if (!confirmed) return;

    const ok = undoLastOperation();
    if (!ok) {
      showToast($_('editor.undo_failed'), 'error');
      return;
    }

    handleSearch(true);
    showToast($_('editor.undo_success'), 'success');
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;

    const isPrimary = event.ctrlKey || event.metaKey;
    if (!isPrimary || event.altKey) return;
    const isEditable = isEditableTarget(event.target);

    const key = event.key.toLowerCase();

    if (isEditable && key !== 's') {
      return;
    }

    if (key === 'o' && !event.shiftKey) {
      event.preventDefault();
      void handleOpen();
      return;
    }

    if (key === 'n' && !event.shiftKey) {
      event.preventDefault();
      void handleCreate();
      return;
    }

    if (key === 'n' && event.shiftKey) {
      event.preventDefault();
      dispatchAppShortcut('new-card');
      return;
    }

    if (key === 's' && !event.shiftKey) {
      event.preventDefault();
      void handleSave();
      return;
    }

    if (!isEditable && key === 'c' && !event.shiftKey) {
      event.preventDefault();
      void handleCopySelection();
      return;
    }

    if (!isEditable && key === 'v' && !event.shiftKey) {
      event.preventDefault();
      void handlePasteSelection();
      return;
    }

    if (!isEditable && key === 'd' && !event.shiftKey) {
      event.preventDefault();
      void handleDeleteSelection();
      return;
    }

    if (!isEditable && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      void handleUndoLastOperation();
      return;
    }

    if (key === 'f' && !event.shiftKey) {
      event.preventDefault();
      dispatchAppShortcut('focus-search');
    }
  }

  onMount(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
    } else {
      applyTheme('dark');
    }

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
    };
  });
</script>

<Toast />


{#if $isLoading}
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--text-secondary);">
    Loading translations...
  </div>
{:else}
<div class="app-container">
  <!-- Top Navigation -->
  <header class="topbar">
    <div class="topbar-left">
      <div class="logo">
        <h1>DataEditorY</h1>
      </div>
      <nav>
        <button class="nav-item" onclick={handleOpen}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          {$_('nav.open')}
        </button>
        <button class="nav-item" onclick={handleCreate}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          {$_('nav.create')}
        </button>
      </nav>
    </div>
    <div class="topbar-right">
      <button class="nav-item theme-toggle" onclick={toggleTheme} title={$_('nav.theme_toggle')}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8"></path><path d="M9 2v2"></path><path d="M15 2v2"></path><path d="M12 4v8"></path><path d="M7 12a5 5 0 1 0 10 0"></path><path d="M9 17h6"></path><path d="M10 20h4"></path></svg>
        {theme === 'dark' ? $_('nav.day_mode') : $_('nav.night_mode')}
      </button>
      <button class="nav-item lang-toggle" onclick={toggleLanguage}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        {$locale === 'zh' ? 'English' : '中文'}
      </button>
    </div>
  </header>

  <!-- Tab Bar -->
  {#if $tabs.length > 0}
  <div class="tab-bar">
    {#each $tabs as tab (tab.id)}
      <button
        class="tab-item"
        class:active={$activeTabId === tab.id}
        onclick={() => activeTabId.set(tab.id)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
        <span class="tab-name">{tab.name}</span>
        {#if tab.isDirty}
          <span class="tab-dirty" aria-label={$_('editor.unsaved_badge')} title={$_('editor.unsaved_badge')}>•</span>
        {/if}
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); void handleCloseTab(tab.id); }}
          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void handleCloseTab(tab.id); } }}
        >×</span>
      </button>
    {/each}
    <button class="tab-add" onclick={handleOpen} title="Open another CDB">
      +
    </button>
  </div>
  {/if}

  <!-- Main Content Area -->
  <main class="main-content">
    {@render children()}
  </main>
</div>
{/if}

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .topbar {
    height: clamp(56px, 3.2vw, 68px);
    flex-shrink: 0;
    background-color: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-md);
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-xl);
  }

  .logo {
    display: flex;
    align-items: center;
  }

  .logo h1 {
    font-size: clamp(1.05rem, 0.4vw + 0.85rem, 1.35rem);
    font-weight: 700;
    color: var(--accent-primary);
    letter-spacing: -0.5px;
    margin: 0;
  }

  nav {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--border-radius-md);
    font-weight: 500;
    font-size: 0.92rem;
    transition: all 0.2s ease;
    cursor: pointer;
    background: transparent;
    border: none;
    outline: none;
    font-family: inherit;
  }

  .lang-toggle {
    border: 1px solid var(--border-color);
  }

  .theme-toggle {
    border: 1px solid var(--border-color);
    background: var(--bg-base);
  }

  .nav-item:hover {
    background-color: var(--bg-surface-hover);
    color: var(--text-primary);
  }


  .nav-item svg {
    opacity: 0.8;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    background-color: var(--bg-base);
  }

  /* Tab Bar */
  .tab-bar {
    display: flex;
    align-items: stretch;
    background-color: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab-bar::-webkit-scrollbar {
    height: 0;
  }

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: 0.92rem;
    font-weight: 500;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border-color);
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    font-family: inherit;
    max-width: 180px;
    position: relative;
  }

  .tab-item:hover {
    background-color: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .tab-item.active {
    background-color: var(--bg-base);
    color: var(--accent-primary);
    border-bottom: 2px solid var(--accent-primary);
  }

  .tab-item.active svg {
    color: var(--accent-primary);
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-dirty {
    color: #f59e0b;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.95;
  }

  .tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
    opacity: 0.5;
    transition: all 0.15s;
    cursor: pointer;
  }

  .tab-close:hover {
    opacity: 1;
    background-color: rgba(255, 80, 80, 0.2);
    color: #ff5050;
  }

  .tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    font-size: 1.2rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .tab-add:hover {
    color: var(--accent-primary);
    background-color: var(--bg-surface-hover);
  }
</style>
