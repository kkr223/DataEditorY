<script lang="ts">
  import '../app.css';
  import { setupI18n } from '$lib/i18n';
  import { _, locale, isLoading } from 'svelte-i18n';
  import { openCdbFile, createCdbFile, tabs, activeTabId, closeTab } from '$lib/stores/db';
  import Toast from '$lib/components/Toast.svelte';
  
  // initialize immediately
  setupI18n();

  let { children } = $props();

  function toggleLanguage() {
    locale.set($locale === 'en' ? 'zh' : 'en');
  }

  async function handleOpen() {
    await openCdbFile();
  }

  async function handleCreate() {
    await createCdbFile();
  }
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
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          onclick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
          onkeydown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.id); } }}
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
    height: 57px;
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
    font-size: 1.15rem;
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

  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--border-radius-md);
    font-weight: 500;
    font-size: 0.9rem;
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
    font-size: 0.85rem;
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
    font-size: 1.1rem;
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
