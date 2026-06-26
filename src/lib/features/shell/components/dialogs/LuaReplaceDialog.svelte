<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { activeTab } from '$lib/stores/db';
  import { showToast } from '$lib/stores/toast.svelte';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import {
    type LuaReplacePreview,
    type LuaReplaceRequest,
  } from '$lib/native/scriptApi';
  import { startTask } from '$lib/native/taskApi';
  import { appendWorkspaceTaskHistory } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

  let {
    open = false,
    onClose = () => {},
  }: {
    open?: boolean;
    onClose?: () => void;
  } = $props();

  let find = $state('');
  let replace = $state('');
  let include = $state('');
  let exclude = $state('');
  let regex = $state(false);
  let caseSensitive = $state(false);
  let isRunning = $state(false);
  let preview = $state<LuaReplacePreview | null>(null);

  function buildRequest(): LuaReplaceRequest | null {
    const tab = get(activeTab);
    if (!tab || !find.trim()) return null;
    return {
      cdbPath: tab.path,
      find,
      replace,
      regex,
      caseSensitive,
      include,
      exclude,
    };
  }

  function clearPreview() {
    preview = null;
  }

  async function runPreview() {
    const request = buildRequest();
    if (!request) return;
    isRunning = true;
    try {
      preview = await startTask({ kind: 'lua.replace.preview', request }) as LuaReplacePreview;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      isRunning = false;
    }
  }

  async function runApply() {
    const request = buildRequest();
    if (!request || !preview) return;
    const confirmed = await tauriBridge.ask(
      $_('lua_replace.confirm_message', {
        values: {
          files: String(preview.fileCount),
          matches: String(preview.matchCount),
        },
      }) as string,
      { title: $_('lua_replace.title') as string, kind: 'warning' },
    );
    if (!confirmed) return;

    isRunning = true;
    try {
      const result = await startTask({ kind: 'lua.replace.apply', request }) as LuaReplacePreview;
      showToast($_('lua_replace.apply_success', {
        values: {
          files: String(result.fileCount),
          matches: String(result.matchCount),
        },
      }), 'success');
      appendWorkspaceTaskHistory({
        kind: 'lua.replace.apply',
        label: $_('lua_replace.title'),
        summary: {
          fileCount: result.fileCount,
          matchCount: result.matchCount,
          regex,
          caseSensitive,
          include,
          exclude,
        },
      });
      preview = result;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      isRunning = false;
    }
  }
</script>

{#if open}
  <div class="dialog-backdrop" role="presentation" onclick={onClose}>
    <div
      class="replace-dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={$_('lua_replace.title')}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => { if (event.key === 'Escape') onClose(); }}
    >
      <header>
        <div>
          <h2>{$_('lua_replace.title')}</h2>
          <p>{$_('lua_replace.description')}</p>
        </div>
        <button type="button" class="close-btn" onclick={onClose}>×</button>
      </header>

      <div class="form-grid">
        <label>
          <span>{$_('lua_replace.find')}</span>
          <input bind:value={find} oninput={clearPreview} />
        </label>
        <label>
          <span>{$_('lua_replace.replace')}</span>
          <input bind:value={replace} oninput={clearPreview} />
        </label>
        <label>
          <span>{$_('lua_replace.include')}</span>
          <input bind:value={include} placeholder="script/c123" oninput={clearPreview} />
        </label>
        <label>
          <span>{$_('lua_replace.exclude')}</span>
          <input bind:value={exclude} placeholder="deprecated" oninput={clearPreview} />
        </label>
      </div>

      <div class="option-row">
        <label><input type="checkbox" bind:checked={regex} onchange={clearPreview} /> {$_('lua_replace.regex')}</label>
        <label><input type="checkbox" bind:checked={caseSensitive} onchange={clearPreview} /> {$_('lua_replace.case_sensitive')}</label>
      </div>

      {#if preview}
        <section class="preview">
          <strong>{$_('lua_replace.preview_summary', {
            values: {
              files: String(preview.fileCount),
              matches: String(preview.matchCount),
            },
          })}</strong>
          <div class="file-list">
            {#each preview.files as file}
              <article>
                <div class="file-title">
                  <span>{file.path}</span>
                  <strong>{file.matchCount}</strong>
                </div>
                {#each file.diffs?.length ? file.diffs : file.snippets.map((snippet) => ({ before: snippet, after: snippet })) as diff}
                  <div class="diff-pair">
                    <pre class="before">{diff.before}</pre>
                    <pre class="after">{diff.after}</pre>
                  </div>
                {/each}
              </article>
            {/each}
          </div>
        </section>
      {/if}

      <footer>
        <button type="button" class="secondary-action" onclick={onClose}>{$_('editor.card_image_crop_cancel')}</button>
        <button type="button" class="secondary-action" onclick={() => void runPreview()} disabled={isRunning || !find.trim()}>
          {isRunning ? '...' : $_('lua_replace.preview')}
        </button>
        <button type="button" class="primary-action" onclick={() => void runApply()} disabled={isRunning || !preview || preview.matchCount === 0}>
          {$_('lua_replace.apply')}
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

  .replace-dialog {
    width: min(820px, 100%);
    max-height: min(820px, calc(100vh - 48px));
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
  .option-row {
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

  p {
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

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--text-secondary);
  }

  .option-row label {
    flex-direction: row;
    align-items: center;
  }

  input {
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
    gap: 10px;
    min-height: 0;
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow: auto;
  }

  article {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
  }

  .file-title {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: var(--text-secondary);
  }

  .file-title span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-primary);
    font-size: 0.78rem;
  }

  .diff-pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }

  .before,
  .after {
    padding: 8px;
    border-radius: var(--control-radius);
    border: 1px solid var(--border-color);
  }

  .before {
    background: color-mix(in srgb, var(--state-danger-bg) 18%, var(--bg-surface));
  }

  .after {
    background: color-mix(in srgb, var(--state-success-bg) 18%, var(--bg-surface));
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
