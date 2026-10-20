<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { WorkspaceAiPatch, WorkspaceAiProposal } from '$lib/features/ai/types';

  let { proposals, cdbName, onApply }: {
    proposals: WorkspaceAiProposal[];
    cdbName: string;
    onApply: (proposal: WorkspaceAiProposal, patch?: WorkspaceAiPatch) => Promise<void>;
  } = $props();

  function formatValue(value: unknown) {
    if (typeof value === 'string') return value || '(empty)';
    return JSON.stringify(value, null, 2);
  }

  function patchTitle(patch: WorkspaceAiPatch) {
    if (patch.kind === 'card') return `card ${patch.cardCode}`;
    if (patch.kind === 'batch-card') return `batch ${patch.cards.length}`;
    if (patch.kind === 'script') return patch.path;
    if (patch.kind === 'script-test-plan') return patch.path;
    return `image ${patch.cardCode}`;
  }

  function patchRows(patch: WorkspaceAiPatch) {
    if (patch.kind === 'card') {
      return Object.entries(patch.patch as Record<string, unknown>).map(([field, value]) => ({
        field,
        before: (patch.before as Record<string, unknown>)[field],
        after: value,
      }));
    }
    if (patch.kind === 'batch-card') {
      const fields = new Set<string>();
      patch.cards.forEach((card) => Object.keys(card.patch as Record<string, unknown>).forEach((field) => fields.add(field)));
      return [...fields].map((field) => ({ field, before: `${patch.cards.length} cards`, after: 'changed' }));
    }
    if (patch.kind === 'script') {
      return [{ field: 'content', before: '(file)', after: patch.content }];
    }
    if (patch.kind === 'script-test-plan') {
      return [{ field: 'testPlan', before: '(.dey temporary file)', after: patch.plan }];
    }
    return Object.entries(patch.patch as Record<string, unknown>).map(([field, value]) => ({
      field,
      before: '(metadata)',
      after: value,
    }));
  }
</script>

<aside class="ai-inspector" aria-label={$_('surface.ai_proposal_diff')}>
  <section class="context-strip">
    <div>
      <span>{$_('surface.ai_context_cdb')}</span>
      <strong>{cdbName}</strong>
    </div>
    <div>
      <span>{$_('surface.ai_proposal_diff')}</span>
      <strong>{proposals.length}</strong>
    </div>
  </section>

  <section class="review-list">
    <div class="review-title">
      <h3>{$_('surface.ai_proposal_diff')}</h3>
    </div>
    {#if proposals.length}
      {#each proposals as proposal}
        <article class="proposal-card">
          <header class="proposal-head">
            <div>
              <strong>{proposal.title}</strong>
              <small>{proposal.status ?? 'pending'}{proposal.model ? ` / ${proposal.model}` : ''}</small>
            </div>
            <button class="apply-button" type="button" disabled={proposal.status === 'applied'} onclick={() => void onApply(proposal)}>
              {$_('surface.ai_apply_all')}
            </button>
          </header>
          <p class="proposal-summary">{proposal.summary}</p>
          <details class="tool-details">
            <summary>{$_('surface.ai_tool_calls')}</summary>
            {#each proposal.toolRuns as tool}
              <p>{tool.name}: {tool.status}</p>
            {/each}
          </details>
          {#each proposal.patches as patch}
            <details class="patch-card" open>
              <summary>{patch.kind}: {patchTitle(patch)}</summary>
              <div class="patch-actions">
                <button class="ghost-button" type="button" onclick={() => void onApply(proposal, patch)}>
                  {$_('surface.ai_apply_patch')}
                </button>
              </div>
              <div class="proposal-diff">
                {#each patchRows(patch) as row}
                  <div class="diff-row">
                    <strong>{row.field}</strong>
                    <pre class="before">- {formatValue(row.before)}</pre>
                    <pre class="after">+ {formatValue(row.after)}</pre>
                  </div>
                {/each}
              </div>
            </details>
          {/each}
        </article>
      {/each}
    {:else}
      <p class="empty-note">{$_('surface.ai_proposal_empty')}</p>
    {/if}
  </section>
</aside>

<style>
  button {
    font: inherit;
    border: 0;
    border-radius: var(--control-radius-soft);
    cursor: pointer;
    color: var(--ai-ink);
    background: var(--bg-surface-active);
    font-weight: 700;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .ghost-button {
    padding: 0.42rem 0.62rem;
    border: 1px solid var(--ai-line);
    background: transparent;
  }

  .ghost-button:hover {
    background: var(--bg-surface-hover);
  }
  .empty-note, .proposal-card small, .tool-details p {
    color: var(--ai-muted);
    font-size: var(--text-xs);
  }
  .empty-note {
    margin: 0;
    padding: 12px 10px;
    line-height: 1.45;
  }

  h3, p {
    margin: 0;
  }
  h3 {
    font-size: var(--text-base);
    line-height: 1.2;
  }

  .apply-button {
    padding: 0.48rem 0.7rem;
    color: var(--text-on-accent);
    background: var(--ai-accent);
  }

  .ai-inspector {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    border-left: 1px solid var(--ai-line);
    overflow: hidden;
    background: color-mix(in srgb, var(--bg-surface) 84%, var(--bg-base));
  }

  .context-strip,
  .review-list {
    border: 1px solid var(--ai-line);
    border-radius: var(--radius-card);
    background: var(--bg-base);
  }

  .context-strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .context-strip div {
    min-width: 0;
    padding: 10px;
  }

  .context-strip div + div {
    border-left: 1px solid var(--ai-line);
    text-align: right;
  }

  .context-strip span {
    display: block;
    margin-bottom: 4px;
    color: var(--ai-muted);
    font-size: var(--text-2xs);
    text-transform: uppercase;
  }

  .context-strip strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .review-list {
    min-height: 0;
    overflow: auto;
    padding: 10px;
  }

  .review-title {
    position: sticky;
    top: -10px;
    z-index: 1;
    padding: 0 0 9px;
    background: var(--bg-base);
  }

  .proposal-card {
    display: grid;
    gap: 10px;
    padding: 11px;
    border: 1px solid var(--ai-line);
    border-radius: var(--radius-card);
    background: var(--ai-soft);
  }

  .proposal-card + .proposal-card {
    margin-top: 10px;
  }

  .proposal-head {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: flex-start;
  }

  .proposal-head strong {
    display: block;
    line-height: 1.25;
  }

  .proposal-summary {
    color: var(--ai-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .tool-details,
  .patch-card {
    border-top: 1px solid var(--ai-line);
    padding-top: 8px;
  }

  summary {
    cursor: pointer;
    color: var(--ai-ink);
    font-size: var(--text-sm);
    font-weight: 760;
  }

  .patch-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .proposal-diff {
    display: grid;
    gap: 6px;
    max-height: 320px;
    overflow: auto;
    margin-top: 8px;
  }

  .diff-row {
    display: grid;
    gap: 5px;
    padding: 8px;
    border: 1px solid var(--ai-line);
    border-radius: var(--control-radius-soft);
    background: var(--bg-base);
  }

  .diff-row strong {
    font-size: var(--text-xs);
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: var(--text-xs);
    line-height: 1.42;
  }

  .before {
    color: var(--state-danger-fg);
  }

  .after {
    color: var(--state-success-fg);
  }

  @media (max-width: 1180px) {
    .ai-inspector {
      grid-column: 1 / -1;
      grid-row: 2;
      grid-template-columns: 260px 1fr;
      grid-template-rows: minmax(0, 1fr);
      border-top: 1px solid var(--ai-line);
      border-left: 0;
    }
    .review-list {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (max-width: 860px) {
    .ai-inspector {
      grid-template-columns: minmax(0, 1fr);
    }
    .review-list {
      grid-column: auto;
      grid-row: auto;
    }
  }
</style>
