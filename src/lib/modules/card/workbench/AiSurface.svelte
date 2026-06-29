<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { activeTab } from '$lib/stores/db';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createAiAppContext } from '$lib/features/ai/context';
  import { runScriptTestPlan } from '$lib/features/ai/scriptTestRunner';
  import { runWorkspaceAgent, type AgentStage } from '$lib/native/aiApi';
  import { appSettingsState, connectAiProvider, loadAppSettings, saveAppSettings } from '$lib/stores/appSettings.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { writeTextFile } from '$lib/infrastructure/tauri/commands';
  import { cloneEditableCard } from '$lib/domain/card/draft';
  import type { CardDataEntry } from '$lib/types';
  import type { CardCollectionCommand } from '$lib/modules/card';
  import {
    accumulateAiThreadTokenUsage,
    addAiProposal,
    appendAiMessage,
    compactAiThreadMessages,
    deleteAiThread,
    getActiveAiThread,
    getAiProposalsForThread,
    getAiThreads,
    getCardImageDocument,
    setCardImageDocument,
    updateAiProposalStatus,
    upsertAiToolRun,
    upsertAiThread,
    workspaceMetadataState,
    type WorkspaceAiPatch,
    type WorkspaceAiMessage,
    type WorkspaceAiProposal,
    type WorkspaceAiToolRun,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import {
    createCardImageFormData,
    normalizeCardImageFormData,
  } from '$lib/features/card-image/layout';

  const FULL_ACCESS_KEY = 'dataeditory:ai-full-access';

  const threads = $derived.by(() => {
    workspaceMetadataState.metadata;
    return getAiThreads();
  });
  const activeThread = $derived.by(() => {
    workspaceMetadataState.metadata;
    return getActiveAiThread();
  });
  const proposals = $derived.by(() => {
    workspaceMetadataState.metadata;
    return activeThread ? getAiProposalsForThread(activeThread.id) : [];
  });

  let composer = $state('');
  let isRunning = $state(false);
  let stage = $state<AgentStage | ''>('');
  let abortController = $state<AbortController | null>(null);
  let fullAccess = $state(globalThis.localStorage?.getItem(FULL_ACCESS_KEY) === 'true');
  let accessMenuOpen = $state(false);
  let modelMenuOpen = $state(false);
  let modelFilterActive = $state(false);
  let lastCompactionKey = $state('');
  let runningTestPatchId = $state('');
  let scriptTestResults = $state<Record<string, { ok: boolean; message: string }>>({});
  const stageLabel = $derived(stage ? $_(`surface.ai_stage_${stage}`) : '');
  const accessModeLabel = $derived(fullAccess ? $_('surface.ai_full_access') : $_('surface.ai_review_access'));

  // Real token usage accumulated from API responses (for display / billing)
  const threadTokenUsage = $derived.by(() => {
    workspaceMetadataState.metadata;
    return activeThread?.tokenUsage ?? null;
  });

  // Estimated context size (for compaction trigger only, not displayed)
  const modelContextLimit = $derived(appSettingsState.modelContextLimits[appSettingsState.values.model] ?? null);
  const modelOutputLimit = $derived(appSettingsState.modelOutputLimits[appSettingsState.values.model] ?? null);
  const contextTokenEstimate = $derived.by(() => {
    const thread = activeThread;
    let total = 2500; // system prompt + tools overhead
    total += estimateTokenCount(composer);
    for (const ref of thread?.contextRefs ?? []) {
      total += estimateTokenCount(`${ref.type}:${ref.label}:${JSON.stringify(ref.value ?? '')}`);
    }
    for (const message of thread?.messages ?? []) {
      total += 4 + estimateTokenCount(message.content ?? '');
    }
    return total;
  });

  const filteredModelOptions = $derived.by(() => {
    const query = modelFilterActive ? appSettingsState.values.model.trim().toLowerCase() : '';
    if (!query) return appSettingsState.modelOptions;
    return appSettingsState.modelOptions.filter((model) => model.toLowerCase().includes(query));
  });

  function createThread() {
    return upsertAiThread({
      title: $activeTab?.name ?? 'AI Workspace',
      contextRefs: $activeTab
        ? [{
            type: 'cdb',
            label: $activeTab.name,
            value: { path: $activeTab.path, documentId: $activeTab.id },
          }]
        : [],
    });
  }

  function ensureThread() {
    return activeThread ?? createThread();
  }

  function setActiveThread(thread: ReturnType<typeof getAiThreads>[number]) {
    upsertAiThread(thread);
  }

  async function removeThread(thread: ReturnType<typeof getAiThreads>[number], event: MouseEvent) {
    event.stopPropagation();
    const ok = await confirm($_('surface.ai_delete_thread_confirm', { values: { title: thread.title } }));
    if (!ok) return;
    if (isRunning && activeThread?.id === thread.id) cancelRun();
    deleteAiThread(thread.id);
  }

  function persistFullAccess(value: boolean) {
    fullAccess = value;
    accessMenuOpen = false;
    globalThis.localStorage?.setItem(FULL_ACCESS_KEY, String(value));
  }

  /**
   * Estimate token count for mixed Chinese/English text.
   * CJK characters are ~1 token each; ASCII words average ~1 token per 4 chars.
   * Add ~10% overhead for JSON/role wrapper framing.
   */
  function estimateTokenCount(text: string) {
    let cjk = 0;
    let ascii = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      if (
        (cp >= 0x4e00 && cp <= 0x9fff) ||   // CJK Unified
        (cp >= 0x3400 && cp <= 0x4dbf) ||   // CJK Extension A
        (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK Compatibility
        (cp >= 0x3000 && cp <= 0x303f) ||   // CJK Symbols & Punctuation
        (cp >= 0xff00 && cp <= 0xffef)       // Fullwidth forms
      ) {
        cjk += 1;
      } else {
        ascii += 1;
      }
    }
    const raw = cjk + Math.ceil(ascii / 4);
    return Math.ceil(raw * 1.1);
  }

  function formatTokenCount(tokens: number) {
    if (tokens >= 1000) {
      const value = Math.round((tokens / 1000) * 10) / 10;
      return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`;
    }
    return String(tokens);
  }

  function formatContextUsage(used: number, limit: number | null) {
    const usedLabel = formatTokenCount(used);
    if (!limit) return `${usedLabel}/?`;
    return `${usedLabel}/${formatTokenCount(limit)} (${Math.round((used / limit) * 100)}%)`;
  }

  function buildCompactionSummary(messages: WorkspaceAiMessage[], keepLast: number) {
    const compacted = messages.slice(0, Math.max(0, messages.length - keepLast));
    const body = compacted
      .map((message) => {
        const model = message.model ? `/${message.model}` : '';
        const content = message.content.replace(/\s+/g, ' ').slice(0, 240);
        return `${message.role}${model}: ${content}`;
      })
      .join('\n')
      .slice(0, 5000);
    return `${$_('surface.ai_context_compacted', { values: { count: String(compacted.length) } })}\n${body}`;
  }

  async function saveModel() {
    modelMenuOpen = false;
    modelFilterActive = false;
    await saveAppSettings({
      ...appSettingsState.values,
      model: appSettingsState.values.model,
    });
    showToast($_('surface.ai_model_saved'), 'success');
  }

  async function refreshModels() {
    try {
      const currentModel = appSettingsState.values.model;
      const result = await connectAiProvider({
        apiBaseUrl: appSettingsState.values.apiBaseUrl,
        scriptTemplate: appSettingsState.values.scriptTemplate,
        preferredModel: currentModel,
        persist: false,
      });
      appSettingsState.values = {
        ...appSettingsState.values,
        model: currentModel || result.selectedModel,
      };
      modelFilterActive = false;
      modelMenuOpen = true;
      showToast($_('surface.ai_refresh_models'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : $_('surface.ai_refresh_models'), 'error');
    }
  }

  async function chooseModel(model: string) {
    appSettingsState.values.model = model;
    modelMenuOpen = false;
    modelFilterActive = false;
    await saveModel();
  }

  async function handleSubmit() {
    const content = composer.trim();
    if (!content || isRunning) return;

    const thread = ensureThread();
    appendAiMessage({ threadId: thread.id, role: 'user', content });
    composer = '';
    isRunning = true;
    stage = 'requesting_model';
    const controller = new AbortController();
    const announcedStages = new Set<string>();
    abortController = controller;

    const appendRunEvent = (message: string) => {
      appendAiMessage({ threadId: thread.id, role: 'event', content: message });
    };

    try {
      const result = await runWorkspaceAgent({
        threadId: thread.id,
        instruction: content,
        history: thread.messages,
        context: createAiAppContext(),
        signal: controller.signal,
        onStageChange: (nextStage) => {
          stage = nextStage;
          if (!announcedStages.has(nextStage)) {
            announcedStages.add(nextStage);
            appendRunEvent($_(`surface.ai_stage_${nextStage}`));
          }
        },
        onToolCall: (event) => {
          upsertAiToolRun({
            threadId: thread.id,
            id: event.id,
            name: event.name,
            status: 'running',
            input: event.arguments,
            createdAt: Date.now(),
          });
          appendRunEvent($_('surface.ai_tool_started', { values: { name: event.name } }));
        },
        onToolResult: (event) => {
          upsertAiToolRun({
            threadId: thread.id,
            id: event.id,
            name: event.name,
            status: event.ok ? 'completed' : 'failed',
            input: event.arguments,
            outputSummary: summarizeToolEventResult(event.result),
            createdAt: Date.now(),
          });
          appendRunEvent($_(event.ok ? 'surface.ai_tool_completed' : 'surface.ai_tool_failed', { values: { name: event.name } }));
        },
      });
      for (const skill of result.usedSkills) {
        appendAiMessage({
          threadId: thread.id,
          role: 'event',
          content: `使用了 ${skill}`,
          model: result.model,
        });
      }
      appendAiMessage({
        threadId: thread.id,
        role: 'assistant',
        content: result.text,
        model: result.model,
      });
      if (result.proposal) {
        addAiProposal(result.proposal);
      }
      accumulateAiThreadTokenUsage({
        threadId: thread.id,
        promptTokens: result.tokenUsage.promptTokens,
        completionTokens: result.tokenUsage.completionTokens,
        totalTokens: result.tokenUsage.totalTokens,
      });
    } catch (error) {
      appendAiMessage({
        threadId: thread.id,
        role: 'assistant',
        content: controller.signal.aborted
          ? $_('surface.ai_cancelled')
          : error instanceof Error ? error.message : 'AI request failed',
      });
    } finally {
      isRunning = false;
      stage = '';
      abortController = null;
    }
  }

  function cancelRun() {
    abortController?.abort();
  }

  function handleRunButton() {
    if (isRunning) {
      cancelRun();
      return;
    }
    void handleSubmit();
  }

  function summarizeToolEventResult(result: unknown) {
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }

  function formatValue(value: unknown) {
    if (typeof value === 'string') return value || '(empty)';
    return JSON.stringify(value, null, 2);
  }

  function cardChanged(current: CardDataEntry, before: unknown) {
    return JSON.stringify(current) !== JSON.stringify(before);
  }

  async function applyCardPatch(patch: Extract<WorkspaceAiPatch, { kind: 'card' }>) {
    const current = await documentRuntime.query<CardDataEntry | null>(
      patch.documentId,
      { kind: 'getById', cardId: patch.cardCode },
    );
    if (!current) throw new Error(`Card ${patch.cardCode} is not open`);
    if (!fullAccess && cardChanged(current, patch.before)) {
      const ok = await confirm($_('surface.ai_before_mismatch_confirm'));
      if (!ok) throw new Error('Skipped: target changed');
    }
    await executeCardCommand(patch.documentId, {
      kind: 'upsert',
      cards: [cloneEditableCard(patch.after as CardDataEntry)],
    });
  }

  async function applyBatchCardPatch(patch: Extract<WorkspaceAiPatch, { kind: 'batch-card' }>) {
    const cards: CardDataEntry[] = [];
    for (const item of patch.cards) {
      const current = await documentRuntime.query<CardDataEntry | null>(
        patch.documentId,
        { kind: 'getById', cardId: item.cardCode },
      );
      if (!current) throw new Error(`Card ${item.cardCode} is not open`);
      if (!fullAccess && cardChanged(current, item.before)) {
        const ok = await confirm($_('surface.ai_before_mismatch_confirm'));
        if (!ok) throw new Error(`Skipped changed card ${item.cardCode}`);
      }
      cards.push(cloneEditableCard(item.after as CardDataEntry));
    }
    if (cards.length) {
      await executeCardCommand(patch.documentId, { kind: 'upsert', cards });
    }
  }

  async function executeCardCommand(documentId: string, command: CardCollectionCommand) {
    const result = await documentRuntime.execute(documentId, command);
    if (!result.changed) throw new Error('CDB was not changed');
  }

  async function applyScriptPatch(patch: Extract<WorkspaceAiPatch, { kind: 'script' }>) {
    await writeTextFile(patch.path, patch.content);
  }

  async function applyScriptTestPlanPatch(patch: Extract<WorkspaceAiPatch, { kind: 'script-test-plan' }>) {
    await writeTextFile(patch.path, `${JSON.stringify(patch.plan, null, 2)}\n`);
  }

  function patchFileName(path: string) {
    return path.replace(/\\/g, '/').split('/').pop() ?? path;
  }

  function scriptOverridesForProposal(proposal: WorkspaceAiProposal) {
    const overrides: Record<string, string> = {};
    for (const patch of proposal.patches) {
      if (patch.kind === 'script') {
        overrides[patchFileName(patch.path)] = patch.content;
      }
    }
    return overrides;
  }

  async function runTestPlanPatch(
    proposal: WorkspaceAiProposal,
    patch: Extract<WorkspaceAiPatch, { kind: 'script-test-plan' }>,
  ) {
    if (runningTestPatchId) return;
    runningTestPatchId = patch.id;
    try {
      await loadAppSettings();
      const result = await runScriptTestPlan({
        plan: patch.plan,
        cdbPath: patch.cdbPath,
        cardCode: patch.cardCode,
        scriptDirectory: appSettingsState.values.scriptDirectory,
        scriptOverrides: scriptOverridesForProposal(proposal),
      });
      scriptTestResults = {
        ...scriptTestResults,
        [patch.id]: { ok: true, message: result.summary },
      };
      showToast($_('surface.ai_test_passed', { values: { summary: result.summary } }), 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      scriptTestResults = {
        ...scriptTestResults,
        [patch.id]: { ok: false, message },
      };
      showToast($_('surface.ai_test_failed', { values: { message } }), 'error');
    } finally {
      runningTestPatchId = '';
    }
  }

  function applyImagePatch(patch: Extract<WorkspaceAiPatch, { kind: 'image' }>) {
    const current = getCardImageDocument(patch.cardCode);
    const card = (patch.patch && typeof patch.patch === 'object' && 'card' in patch.patch)
      ? (patch.patch as { card?: CardDataEntry }).card
      : null;
    const baseForm = current?.form ?? createCardImageFormData(card ?? ({ code: patch.cardCode } as CardDataEntry));
    const formPatch = patch.patch && typeof patch.patch === 'object' && 'form' in patch.patch
      ? (patch.patch as { form?: Record<string, unknown> }).form ?? {}
      : patch.patch;
    setCardImageDocument(patch.cardCode, {
      kind: 'dataeditory-card-image-config',
      version: 1,
      ...current,
      form: normalizeCardImageFormData({
        ...baseForm,
        ...(formPatch as Record<string, unknown>),
      }),
      exportScalePercent: typeof (patch.patch as { exportScalePercent?: unknown })?.exportScalePercent === 'number'
        ? (patch.patch as { exportScalePercent: number }).exportScalePercent
        : current?.exportScalePercent,
      meta: {
        ...(current?.meta ?? {}),
        cardCode: patch.cardCode,
      },
    });
  }

  async function applyPatch(patch: WorkspaceAiPatch) {
    if (patch.kind === 'card') return applyCardPatch(patch);
    if (patch.kind === 'batch-card') return applyBatchCardPatch(patch);
    if (patch.kind === 'script') return applyScriptPatch(patch);
    if (patch.kind === 'script-test-plan') return applyScriptTestPlanPatch(patch);
    return applyImagePatch(patch);
  }

  async function applyProposal(proposal: WorkspaceAiProposal, singlePatch?: WorkspaceAiPatch) {
    const patches = singlePatch ? [singlePatch] : proposal.patches;
    const log: NonNullable<WorkspaceAiProposal['applyLog']> = [...(proposal.applyLog ?? [])];
    let applied = 0;

    for (const patch of patches) {
      try {
        await applyPatch(patch);
        applied += 1;
        log.push({
          patchId: patch.id,
          ok: true,
          message: 'applied',
          usedFullAccess: fullAccess,
          createdAt: Date.now(),
        });
      } catch (error) {
        log.push({
          patchId: patch.id,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          usedFullAccess: fullAccess,
          createdAt: Date.now(),
        });
        updateAiProposalStatus({
          threadId: proposal.threadId,
          proposalId: proposal.id,
          status: applied > 0 ? 'partially_applied' : 'failed',
          applyLog: log,
        });
        showToast(log.at(-1)?.message ?? 'Apply failed', 'error');
        return;
      }
    }

    updateAiProposalStatus({
      threadId: proposal.threadId,
      proposalId: proposal.id,
      status: singlePatch || applied < proposal.patches.length ? 'partially_applied' : 'applied',
      applyLog: log,
    });
    showToast($_('surface.ai_apply_success'), 'success');
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

  $effect(() => {
    void loadAppSettings();
  });

  $effect(() => {
    const thread = activeThread;
    const contextLimit = modelContextLimit;
    const outputLimit = modelOutputLimit;
    if (!thread || isRunning || !contextLimit || !outputLimit || thread.messages.length < 8) return;
    if (contextLimit - contextTokenEstimate >= outputLimit) return;

    const key = `${thread.id}:${thread.updatedAt}:${contextLimit}:${outputLimit}`;
    if (lastCompactionKey === key) return;
    lastCompactionKey = key;
    compactAiThreadMessages({
      threadId: thread.id,
      keepLast: 6,
      summary: buildCompactionSummary(thread.messages, 6),
      model: appSettingsState.values.model,
    });
  });
</script>

<section class="ai-surface">
  <aside class="thread-list" aria-label={$_('surface.ai_threads')}>
    <div class="rail-title">
      <span>{$_('surface.ai_threads')}</span>
      <button class="icon-button" type="button" onclick={createThread} title={$_('surface.ai_new_thread')}>+</button>
    </div>
    <div class="thread-scroll">
      {#each threads as thread}
        <div class="thread-item" class:active={activeThread?.id === thread.id}>
          <button type="button" class="thread-main" onclick={() => setActiveThread(thread)}>
            <span>{thread.title}</span>
            <small>{$_('surface.ai_message_count', { values: { count: thread.messages.length } })}</small>
          </button>
          <button
            type="button"
            class="thread-delete"
            title={$_('surface.ai_delete_thread')}
            aria-label={$_('surface.ai_delete_thread')}
            onclick={(event) => void removeThread(thread, event)}
          >×</button>
        </div>
      {:else}
        <p class="empty-note">{$_('surface.ai_thread_empty')}</p>
      {/each}
    </div>
  </aside>

  <main class="ai-thread">
    <header class="ai-header">
      <div class="title-block">
        <h2>{$_('surface.ai_title')}</h2>
        {#if isRunning}
          <span>{stageLabel}</span>
        {/if}
      </div>
      <div class="model-row">
        <div class="model-combo">
          <input
            bind:value={appSettingsState.values.model}
            placeholder="model"
            onfocus={() => {
              modelFilterActive = false;
              modelMenuOpen = appSettingsState.modelOptions.length > 0;
            }}
            oninput={() => {
              modelFilterActive = true;
              modelMenuOpen = appSettingsState.modelOptions.length > 0;
            }}
            onblur={() => { setTimeout(() => void saveModel(), 120); }}
          />
          <button
            class="combo-button"
            type="button"
            title={$_('surface.ai_refresh_models')}
            onclick={() => { modelMenuOpen = !modelMenuOpen && appSettingsState.modelOptions.length > 0; }}
          >⌄</button>
          {#if modelMenuOpen && appSettingsState.modelOptions.length}
            <div class="model-menu">
              {#each filteredModelOptions as model}
                <button type="button" onclick={() => void chooseModel(model)}>{model}</button>
              {:else}
                <span class="model-empty">{$_('surface.ai_model_no_match')}</span>
              {/each}
            </div>
          {/if}
        </div>
        <button class="ghost-button" type="button" onclick={refreshModels}>{$_('surface.ai_refresh_models')}</button>
      </div>
    </header>

    <div class="message-list">
      {#each activeThread?.messages ?? [] as message}
        {#if message.role === 'event'}
          <div class="event-line">
            <span>▹</span>
            <p>{message.content}</p>
          </div>
        {:else}
          <article class={`message ${message.role}`}>
            <strong>{message.role}{message.model ? ` / ${message.model}` : ''}</strong>
            <p>{message.content}</p>
          </article>
        {/if}
      {:else}
        <div class="empty-message">{$_('surface.ai_message_empty')}</div>
      {/each}
    </div>

    <footer class="ai-compose">
      <div class="composer-shell">
        <textarea
          class="composer-input"
          bind:value={composer}
          placeholder={$_('surface.ai_composer_placeholder')}
        ></textarea>
        <div class="compose-actions">
          <div
            class="access-menu"
            onfocusout={() => { setTimeout(() => { accessMenuOpen = false; }, 120); }}
          >
            <button
              type="button"
              class="permission-trigger"
              class:danger={fullAccess}
              aria-haspopup="listbox"
              aria-expanded={accessMenuOpen}
              title={$_('surface.ai_full_access_hint')}
              onclick={() => { accessMenuOpen = !accessMenuOpen; }}
            >
              <span>{accessModeLabel}</span>
              <span class="chevron">⌄</span>
            </button>
            {#if accessMenuOpen}
              <div class="access-options" role="listbox" aria-label={$_('surface.ai_access_mode')}>
                <button type="button" class:active={!fullAccess} onclick={() => persistFullAccess(false)}>
                  {$_('surface.ai_review_access')}
                </button>
                <button type="button" class:active={fullAccess} class="danger-option" onclick={() => persistFullAccess(true)}>
                  {$_('surface.ai_full_access')}
                </button>
              </div>
            {/if}
          </div>
          <span class="context-usage" title={$_('surface.ai_context_usage_hint')}>
            {#if threadTokenUsage}
              {formatTokenCount(threadTokenUsage.promptTokens)}↑ {formatTokenCount(threadTokenUsage.completionTokens)}↓ {formatTokenCount(threadTokenUsage.totalTokens)} total
            {:else}
              —
            {/if}
          </span>
          <div class="send-cluster">
            {#if isRunning}
              <span class="stage-chip">{stageLabel || '...'}</span>
            {/if}
            <button
              class="run-button"
              class:running={isRunning}
              type="button"
              title={isRunning ? $_('surface.ai_cancel') : $_('surface.ai_run')}
              disabled={!composer.trim() && !isRunning}
              onclick={handleRunButton}
            >{isRunning ? '■' : '↑'}</button>
          </div>
        </div>
      </div>
    </footer>
  </main>

  <aside class="ai-inspector" aria-label={$_('surface.ai_proposal_diff')}>
    <section class="context-strip">
      <div>
        <span>{$_('surface.ai_context_cdb')}</span>
        <strong>{$activeTab?.name ?? '-'}</strong>
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
              <button class="apply-button" type="button" disabled={proposal.status === 'applied'} onclick={() => void applyProposal(proposal)}>
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
                  <button class="ghost-button" type="button" onclick={() => void applyProposal(proposal, patch)}>
                    {$_('surface.ai_apply_patch')}
                  </button>
                  {#if patch.kind === 'script-test-plan'}
                    <button
                      class="ghost-button"
                      type="button"
                      disabled={Boolean(runningTestPatchId)}
                      onclick={() => void runTestPlanPatch(proposal, patch)}
                    >
                      {runningTestPatchId === patch.id ? $_('surface.ai_test_running') : $_('surface.ai_run_test_plan')}
                    </button>
                  {/if}
                </div>
                {#if scriptTestResults[patch.id]}
                  <p class="test-result" class:failed={!scriptTestResults[patch.id].ok}>
                    {scriptTestResults[patch.id].message}
                  </p>
                {/if}
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
</section>

<style>
  .ai-surface {
    --ai-line: color-mix(in srgb, var(--border-color) 72%, transparent);
    --ai-soft: color-mix(in srgb, var(--bg-surface) 86%, var(--bg-base));
    --ai-ink: var(--text-primary);
    --ai-muted: var(--text-secondary);
    --ai-accent: color-mix(in srgb, var(--accent-primary) 82%, #1f7a68);
    --ai-amber: #b7791f;
    height: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: 216px minmax(440px, 1fr) minmax(330px, 400px);
    overflow: hidden;
    color: var(--ai-ink);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--bg-base) 94%, #0f1f1d), var(--bg-base)),
      var(--bg-base);
  }

  .thread-list,
  .ai-thread,
  .ai-inspector {
    min-width: 0;
    min-height: 0;
  }

  .thread-list {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-right: 1px solid var(--ai-line);
    background: color-mix(in srgb, var(--bg-surface) 92%, #101513);
  }

  .rail-title,
  .ai-header,
  .model-row,
  .proposal-head,
  .compose-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rail-title,
  .ai-header,
  .proposal-head {
    justify-content: space-between;
  }

  .rail-title {
    height: 44px;
    padding: 0 10px 0 14px;
    border-bottom: 1px solid var(--ai-line);
    color: var(--ai-muted);
    font-size: 0.76rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .thread-scroll {
    min-height: 0;
    overflow: auto;
    padding: 8px;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    color: var(--ai-ink);
    background: var(--bg-surface-active);
    font-weight: 750;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .icon-button {
    width: 26px;
    height: 26px;
    padding: 0;
    font-size: 1.05rem;
    line-height: 1;
  }

  .ghost-button {
    padding: 0.42rem 0.62rem;
    border: 1px solid var(--ai-line);
    background: transparent;
  }

  .ghost-button:hover,
  .icon-button:hover {
    background: var(--bg-surface-hover);
  }

  .thread-item {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 26px;
    align-items: center;
    background: transparent;
    color: var(--ai-muted);
    border-left: 3px solid transparent;
  }

  .thread-main {
    min-width: 0;
    display: grid;
    gap: 4px;
    padding: 9px 10px;
    text-align: left;
    background: transparent;
    color: inherit;
  }

  .thread-delete {
    width: 24px;
    height: 24px;
    padding: 0;
    opacity: 0;
    background: transparent;
    color: var(--ai-muted);
  }

  .thread-item + .thread-item {
    margin-top: 3px;
  }

  .thread-item.active,
  .thread-item:hover,
  .thread-item:focus-within {
    color: var(--ai-ink);
    background: var(--bg-surface-hover);
  }

  .thread-item:hover .thread-delete,
  .thread-item:focus-within .thread-delete {
    opacity: 1;
  }

  .thread-delete:hover {
    color: var(--state-danger-text);
    background: color-mix(in srgb, var(--state-danger-bg) 56%, transparent);
  }

  .thread-item.active {
    border-left-color: var(--ai-accent);
  }

  .thread-main span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 760;
  }

  .thread-item small,
  .empty-note,
  .proposal-card small,
  .tool-details p {
    color: var(--ai-muted);
    font-size: 0.78rem;
  }

  .empty-note {
    margin: 0;
    padding: 12px 10px;
    line-height: 1.45;
  }

  .ai-thread {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--bg-base);
  }

  .ai-header {
    height: 44px;
    gap: 10px;
    padding: 0 12px 0 16px;
    border-bottom: 1px solid var(--ai-line);
  }

  .title-block {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    overflow: hidden;
    font-size: 0.92rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  h3 {
    font-size: 0.88rem;
    line-height: 1.2;
  }

  .title-block span {
    overflow: hidden;
    color: var(--ai-muted);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-row {
    min-width: 0;
    flex: 0 1 auto;
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .model-combo {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 28px;
    width: clamp(12rem, 20vw, 18rem);
  }

  .model-combo input {
    height: 28px;
    min-width: 0;
    border: 1px solid var(--ai-line);
    border-right: 0;
    border-radius: 6px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    background: var(--ai-soft);
    color: var(--ai-ink);
    padding: 0 0.48rem;
  }

  .combo-button {
    height: 28px;
    padding: 0;
    border: 1px solid var(--ai-line);
    border-radius: 0 6px 6px 0;
    background: var(--ai-soft);
  }

  .model-menu {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 260px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--ai-line);
    border-radius: 6px;
    background: var(--bg-surface);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.24);
  }

  .model-menu button {
    width: 100%;
    padding: 0.38rem 0.45rem;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: transparent;
  }

  .model-menu button:hover {
    background: var(--bg-surface-hover);
  }

  .model-empty {
    display: block;
    padding: 0.42rem 0.48rem;
    color: var(--ai-muted);
    font-size: 0.78rem;
  }

  .model-row .ghost-button {
    height: 28px;
    padding: 0 0.58rem;
    white-space: nowrap;
  }

  .message-list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    padding: 16px;
  }

  .message,
  .empty-message {
    width: min(780px, 100%);
    padding: 11px 13px;
    border: 1px solid var(--ai-line);
    border-radius: 8px;
    background: var(--ai-soft);
  }

  .message.user {
    align-self: flex-end;
    border-color: color-mix(in srgb, var(--ai-accent) 50%, var(--ai-line));
    background: color-mix(in srgb, var(--ai-accent) 10%, var(--ai-soft));
  }

  .message.assistant {
    align-self: flex-start;
  }

  .event-line {
    width: min(780px, 100%);
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: center;
    color: var(--ai-muted);
    font-size: 0.86rem;
  }

  .event-line span {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--ai-muted) 76%, transparent);
  }

  .event-line p {
    margin: 0;
    line-height: 1.45;
    word-break: break-word;
  }

  .message strong {
    display: block;
    margin-bottom: 6px;
    color: var(--ai-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .message p,
  .empty-message {
    white-space: pre-wrap;
    line-height: 1.55;
    word-break: break-word;
  }

  .empty-message {
    color: var(--ai-muted);
  }

  .ai-compose {
    padding: 14px 16px 16px;
    border-top: 1px solid var(--ai-line);
    background: color-mix(in srgb, var(--bg-surface) 60%, var(--bg-base));
  }

  .composer-shell {
    width: min(860px, 100%);
    min-width: 0;
    display: grid;
    gap: 6px;
    margin: 0 auto;
    padding: 12px;
    border: 1px solid var(--ai-line);
    border-radius: 18px;
    background: var(--bg-surface);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
  }

  .composer-input {
    min-height: 56px;
    max-height: 160px;
    resize: vertical;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ai-ink);
    padding: 2px 4px;
    line-height: 1.45;
  }

  .composer-input:focus,
  input:focus {
    outline: 2px solid color-mix(in srgb, var(--ai-accent) 42%, transparent);
    outline-offset: 1px;
  }

  .compose-actions {
    justify-content: flex-start;
    gap: 12px;
    min-width: 0;
  }

  .send-cluster {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .access-menu {
    position: relative;
    min-width: 8.7rem;
  }

  .permission-trigger {
    height: 30px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-radius: 999px;
    background: transparent;
    color: var(--ai-muted);
    padding: 0 8px;
    font-size: 0.82rem;
    font-weight: 800;
    cursor: pointer;
  }

  .permission-trigger:hover,
  .permission-trigger[aria-expanded='true'] {
    background: var(--bg-surface-hover);
  }

  .permission-trigger.danger,
  .danger-option {
    color: var(--state-danger-text);
  }

  .chevron {
    font-size: 0.8rem;
  }

  .access-options {
    position: absolute;
    z-index: 7;
    left: 0;
    bottom: calc(100% + 6px);
    width: max(100%, 11rem);
    overflow: hidden;
    padding: 4px;
    border: 1px solid var(--ai-line);
    border-radius: 8px;
    background: var(--bg-surface);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28);
  }

  .access-options button {
    width: 100%;
    padding: 0.44rem 0.52rem;
    text-align: left;
    background: transparent;
  }

  .access-options button:hover,
  .access-options button.active {
    background: var(--bg-surface-hover);
  }

  .context-usage {
    flex: 0 1 auto;
    min-width: 0;
    margin-left: auto;
    color: var(--ai-muted);
    font-size: 0.78rem;
    font-weight: 760;
    white-space: nowrap;
  }

  .stage-chip {
    max-width: 12rem;
    overflow: hidden;
    color: var(--ai-muted);
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .run-button,
  .apply-button {
    padding: 0.48rem 0.7rem;
    color: #fff;
    background: var(--ai-accent);
  }

  .run-button {
    position: relative;
    width: 38px;
    height: 38px;
    padding: 0;
    border-radius: 50%;
    font-size: 1.35rem;
    line-height: 1;
  }

  .run-button.running {
    background: var(--bg-surface-active);
  }

  .run-button.running::before {
    content: '';
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: var(--ai-accent);
    border-right-color: color-mix(in srgb, var(--ai-accent) 55%, transparent);
    animation: ai-spin 0.8s linear infinite;
  }

  @keyframes ai-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .ai-inspector {
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
    border-radius: 8px;
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
    font-size: 0.72rem;
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
    border-radius: 8px;
    background: var(--ai-soft);
  }

  .proposal-card + .proposal-card {
    margin-top: 10px;
  }

  .proposal-head {
    align-items: flex-start;
  }

  .proposal-head strong {
    display: block;
    line-height: 1.25;
  }

  .proposal-summary {
    color: var(--ai-muted);
    font-size: 0.82rem;
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
    font-size: 0.82rem;
    font-weight: 760;
  }

  .patch-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .test-result {
    margin-top: 8px;
    color: #2f9b73;
    font-size: 0.78rem;
    line-height: 1.45;
    word-break: break-word;
  }

  .test-result.failed {
    color: #cc5964;
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
    border-radius: 6px;
    background: var(--bg-base);
  }

  .diff-row strong {
    font-size: 0.76rem;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.75rem;
    line-height: 1.42;
  }

  .before {
    color: #cc5964;
  }

  .after {
    color: #2f9b73;
  }

  @media (max-width: 1180px) {
    .ai-surface {
      grid-template-columns: 200px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) minmax(260px, 40vh);
    }

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
    .ai-surface {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) minmax(260px, 42vh);
    }

    .thread-list {
      border-right: 0;
      border-bottom: 1px solid var(--ai-line);
    }

    .thread-scroll {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 8px;
    }

    .thread-item {
      min-width: 180px;
    }

    .ai-header,
    .ai-compose,
    .ai-inspector {
      grid-template-columns: minmax(0, 1fr);
    }

    .model-row {
      justify-content: flex-start;
    }

    .review-list {
      grid-column: auto;
      grid-row: auto;
    }
  }
</style>
