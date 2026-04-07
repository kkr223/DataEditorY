<script lang="ts">
  import { _ , locale } from 'svelte-i18n';
  import type { RecentCdbEntry } from '$lib/stores/db';
  import RecentHistoryPopover from '$lib/features/shell/components/RecentHistoryPopover.svelte';

  let {
    theme = 'dark',
    hasActiveCdb = false,
    hasPackageTarget = false,
    isOpenHistoryVisible = false,
    recentEntries = [],
    onOpen = async () => {},
    onCreate = async () => {},
    onCreateFilteredCdb = async () => {},
    onMergeCdb = async () => {},
    onOpenSettings = () => {},
    onPackageZip = async () => {},
    onPackageYpk = async () => {},
    onToggleTheme = () => {},
    onToggleLanguage = () => {},
    onShowOpenHistory = () => {},
    onHideOpenHistory = () => {},
    onHideOpenHistoryImmediately = () => {},
    onShowPackageMenu = () => {},
    onHidePackageMenu = () => {},
    isPackageMenuVisible = false,
    onOpenRecent = async (_path: string) => {},
    onRemoveRecent = (_path: string) => {},
  }: {
    theme?: 'dark' | 'light';
    hasActiveCdb?: boolean;
    hasPackageTarget?: boolean;
    isOpenHistoryVisible?: boolean;
    recentEntries?: RecentCdbEntry[];
    onOpen?: () => void | Promise<void>;
    onCreate?: () => void | Promise<void>;
    onCreateFilteredCdb?: () => void | Promise<void>;
    onMergeCdb?: () => void | Promise<void>;
    onOpenSettings?: () => void;
    onPackageZip?: () => void | Promise<void>;
    onPackageYpk?: () => void | Promise<void>;
    onToggleTheme?: () => void;
    onToggleLanguage?: () => void;
    onShowOpenHistory?: () => void;
    onHideOpenHistory?: () => void;
    onHideOpenHistoryImmediately?: () => void;
    onShowPackageMenu?: () => void;
    onHidePackageMenu?: () => void;
    isPackageMenuVisible?: boolean;
    onOpenRecent?: (path: string) => void | Promise<void>;
    onRemoveRecent?: (path: string) => void;
  } = $props();
</script>

<header class="topbar">
  <div class="topbar-left">
    <div class="logo">
      <h1>DataEditorY</h1>
    </div>
    <nav>
      <div
        class="nav-item-group open-nav-group"
        role="group"
        aria-label={$_('nav.open_recent')}
        onmouseenter={onShowOpenHistory}
        onmouseleave={onHideOpenHistory}
        onfocusin={onShowOpenHistory}
        onfocusout={onHideOpenHistory}
      >
        <button class="nav-item" onclick={onOpen} aria-haspopup="menu" aria-expanded={isOpenHistoryVisible}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          {$_('nav.open')}
        </button>
        <RecentHistoryPopover
          visible={isOpenHistoryVisible}
          entries={recentEntries}
          onOpen={onOpenRecent}
          onRemove={onRemoveRecent}
          onHideImmediately={onHideOpenHistoryImmediately}
        />
      </div>
      <button class="nav-item" onclick={onCreate}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        {$_('nav.create')}
      </button>
      <button class="nav-item" onclick={onCreateFilteredCdb} disabled={!hasActiveCdb}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>
        {$_('nav.create_filtered_cdb')}
      </button>
      <button class="nav-item" onclick={onMergeCdb}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 3 4 4-4 4"></path><path d="m16 21-4-4 4-4"></path><path d="M12 7v10"></path></svg>
        {$_('nav.merge_cdb')}
      </button>
      <button class="nav-item" onclick={onOpenSettings}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a2 2 0 0 1 2 2v.35a1 1 0 0 0 .57.9l.31.15a1 1 0 0 0 1.04-.1l.25-.18a2 2 0 0 1 2.8.24l.99 1.15a2 2 0 0 1-.15 2.82l-.26.22a1 1 0 0 0-.3.98l.1.35a1 1 0 0 0 .77.7l.32.07a2 2 0 0 1 1.56 1.95v1.5a2 2 0 0 1-1.56 1.95l-.32.07a1 1 0 0 0-.77.7l-.1.35a1 1 0 0 0 .3.98l.26.22a2 2 0 0 1 .15 2.82l-.99 1.15a2 2 0 0 1-2.8.24l-.25-.18a1 1 0 0 0-1.04-.1l-.31.15a1 1 0 0 0-.57.9V19a2 2 0 0 1-2 2h-1.5a2 2 0 0 1-2-2v-.35a1 1 0 0 0-.57-.9l-.31-.15a1 1 0 0 0-1.04.1l-.25.18a2 2 0 0 1-2.8-.24l-.99-1.15a2 2 0 0 1 .15-2.82l.26-.22a1 1 0 0 0 .3-.98l-.1-.35a1 1 0 0 0-.77-.7l-.32-.07A2 2 0 0 1 2 15.75v-1.5A2 2 0 0 1 3.56 12.3l.32-.07a1 1 0 0 0 .77-.7l.1-.35a1 1 0 0 0-.3-.98l-.26-.22a2 2 0 0 1-.15-2.82l.99-1.15a2 2 0 0 1 2.8-.24l.25.18a1 1 0 0 0 1.04.1l.31-.15a1 1 0 0 0 .57-.9V5a2 2 0 0 1 2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        {$_('nav.settings')}
      </button>
      <div
        class="nav-item-group package-nav-group"
        role="group"
        aria-label={$_('nav.package')}
        onmouseenter={onShowPackageMenu}
        onmouseleave={onHidePackageMenu}
        onfocusin={onShowPackageMenu}
        onfocusout={onHidePackageMenu}
      >
        <button class="nav-item" disabled={!hasPackageTarget} aria-haspopup="menu" aria-expanded={isPackageMenuVisible}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path><path d="M12 3v18"></path></svg>
          {$_('nav.package')}
          <svg xmlns="http://www.w3.org/2000/svg" class="nav-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
        </button>
        {#if hasPackageTarget && isPackageMenuVisible}
          <div class="package-popover" role="menu" aria-label={$_('nav.package')}>
            <button class="package-item" role="menuitem" onclick={onPackageZip}>
              {$_('nav.package_zip')}
            </button>
            <button class="package-item" role="menuitem" onclick={onPackageYpk}>
              {$_('nav.package_ypk')}
            </button>
          </div>
        {/if}
      </div>
    </nav>
  </div>
  <div class="topbar-right">
    <button class="nav-item theme-toggle" onclick={onToggleTheme} title={$_('nav.theme_toggle')}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8"></path><path d="M9 2v2"></path><path d="M15 2v2"></path><path d="M12 4v8"></path><path d="M7 12a5 5 0 1 0 10 0"></path><path d="M9 17h6"></path><path d="M10 20h4"></path></svg>
      {theme === 'dark' ? $_('nav.day_mode') : $_('nav.night_mode')}
    </button>
    <button class="nav-item lang-toggle" onclick={onToggleLanguage}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
      {$locale === 'zh' ? 'English' : '中文'}
    </button>
  </div>
</header>

<style>
  .topbar {
    height: 3.2rem;
    flex-shrink: 0;
    background-color: var(--bg-surface);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 calc(var(--spacing-md) - 2px);
    position: relative;
    z-index: 30;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing-xl) - 6px);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing-sm) - 2px);
  }

  .logo {
    display: flex;
    align-items: center;
  }

  .logo h1 {
    font-size: 1.08rem;
    font-weight: 700;
    color: var(--accent-primary);
    letter-spacing: -0.5px;
    margin: 0;
  }

  nav {
    display: flex;
    align-items: center;
    gap: calc(var(--spacing-sm) - 2px);
  }

  .nav-item-group {
    position: relative;
  }

  .open-nav-group {
    display: flex;
    padding-bottom: 8px;
    margin-bottom: -8px;
  }

  .package-nav-group {
    display: flex;
    padding-bottom: 8px;
    margin-bottom: -8px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.32rem;
    padding: 0.34rem 0.62rem;
    color: var(--text-secondary);
    text-decoration: none;
    border-radius: var(--border-radius-md);
    font-weight: 500;
    font-size: 0.86rem;
    line-height: 1;
    transition: all 0.2s ease;
    cursor: pointer;
    background: transparent;
    border: none;
    outline: none;
    font-family: inherit;
  }

  .nav-item svg {
    opacity: 0.8;
  }

  .nav-caret {
    opacity: 0.66;
  }

  .nav-item:hover {
    background-color: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .nav-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .nav-item:disabled:hover {
    background: transparent;
    color: var(--text-secondary);
  }

  .lang-toggle {
    border: 1px solid var(--border-color);
  }

  .theme-toggle {
    border: 1px solid var(--border-color);
    background: var(--bg-base);
  }

  .package-popover {
    position: absolute;
    top: calc(100% - 2px);
    left: 0;
    min-width: 9rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0.35rem;
    border-radius: calc(var(--border-radius-md) + 2px);
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.24);
    z-index: 40;
  }

  .package-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.48rem 0.62rem;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    border-radius: var(--border-radius-md);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .package-item:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }
</style>
