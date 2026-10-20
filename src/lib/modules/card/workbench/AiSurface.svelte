<script lang="ts">
  import { onDestroy } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import { activeTab } from '$lib/stores/db';
  import { showToast } from '$lib/stores/toast.svelte';
  import { createAiAppContext } from '$lib/features/ai/context';
  import { runWorkspaceAgent, type AgentStage } from '$lib/native/aiApi';
  import { appSettingsState, connectAiProvider, loadAppSettings, saveAppSettings } from '$lib/stores/appSettings.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import type { CardDataEntry } from '$lib/types';
  import type { CardSearchExpression, CardSearchPage } from '$lib/modules/card';
  import { mergeWorkspaceAiContextRefs } from './aiContextRefs';
  import {
    buildMentionContextPrompt,
    cardMentionLabel,
    createCardMentionContextRef,
    filterCardMentionContextRefsForText,
    findCardMentionDeleteRange,
    findCardMentionToken,
    removeCardMentionRange,
    replaceCardMention,
    type CardMentionToken,
  } from './aiMentions';
  import {
    accumulateAiThreadTokenUsage,
    addAiProposal,
    appendAiMessage,
    compactAiThreadMessages,
    deleteAiThread,
    getActiveAiThread,
    getAiProposalsForThread,
    getAiThreads,
    updateAiProposalStatus,
    upsertAiToolRun,
    upsertAiThread,
  } from '$lib/features/ai/workspaceState';
  import { workspaceMetadataState, captureWorkspaceMetadataScope } from '$lib/features/workspace-metadata/state.svelte';
  import type { WorkspaceAiPatch, WorkspaceAiMessage, WorkspaceAiProposal } from '$lib/features/ai/types';
  import { createAiProposalApplier } from '$lib/features/ai/proposalApplication';
  import { createAiPatchApplier } from './aiProposalExecution';
  import AiProposalInspector from './AiProposalInspector.svelte';
  import { renderMarkdown } from './markdown';

  const FULL_ACCESS_KEY = 'dataeditory:ai-full-access';
  const MENTION_SEARCH_DEBOUNCE_MS = 150;

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
    return activeThread
      ? getAiProposalsForThread(activeThread.id)
          .map((proposal) => ({
            ...proposal,
            patches: proposal.patches.filter((patch) => patch.kind !== 'script-test-plan'),
          }))
          .filter((proposal) => proposal.patches.length > 0)
      : [];
  });

  let composer = $state('');
  let isRunning = $state(false);
  let stage = $state<AgentStage | ''>('');
  let abortController = $state<AbortController | null>(null);
  let ownsRunningWorkspace: (() => boolean) | null = null;
  let isDisposed = false;
  let fullAccess = $state(globalThis.localStorage?.getItem(FULL_ACCESS_KEY) === 'true');
  let accessMenuOpen = $state(false);
  let modelMenuOpen = $state(false);
  let modelFilterActive = $state(false);
  let lastCompactionKey = $state('');
  let composerInput = $state<HTMLTextAreaElement | null>(null);
  let mentionToken = $state<CardMentionToken | null>(null);
  let mentionCandidates = $state<CardDataEntry[]>([]);
  let mentionOpen = $state(false);
  let mentionLoading = $state(false);
  let mentionRequestId = 0;
  let mentionSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let mentionTabId = '';
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
  const threadContextTokenEstimate = $derived.by(() => {
    const thread = activeThread;
    let total = 2500; // system prompt + tools overhead
    for (const ref of thread?.contextRefs ?? []) {
      total += estimateTokenCount(`${ref.type}:${ref.label}:${JSON.stringify(ref.value ?? '')}`);
    }
    for (const message of thread?.messages ?? []) {
      total += 4 + estimateTokenCount(message.content ?? '');
    }
    return total;
  });
  const contextTokenEstimate = $derived(threadContextTokenEstimate + estimateTokenCount(composer));

  const filteredModelOptions = $derived.by(() => {
    const query = modelFilterActive ? appSettingsState.values.model.trim().toLowerCase() : '';
    if (!query) return appSettingsState.modelOptions;
    return appSettingsState.modelOptions.filter((model) => model.toLowerCase().includes(query));
  });
  const cardContextRefs = $derived.by(() => (
    (activeThread?.contextRefs ?? []).filter((ref) => ref.type === 'card')
  ));

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
    const ok = await tauriBridge.ask(
      $_('surface.ai_delete_thread_confirm', { values: { title: thread.title } }),
      { title: $_('surface.ai_title'), kind: 'warning' },
    );
    if (!ok) return;
    if (isRunning && activeThread?.id === thread.id) cancelRun();
    deleteAiThread(thread.id);
  }

  function persistFullAccess(value: boolean) {
    fullAccess = value;
    accessMenuOpen = false;
    globalThis.localStorage?.setItem(FULL_ACCESS_KEY, String(value));
  }

  function mentionSearchExpression(query: string): CardSearchExpression {
    const value = query.trim();
    if (!value) return { kind: 'all' };
    const expressions: CardSearchExpression[] = [
      { kind: 'textContains', field: 'name', value },
      { kind: 'textContains', field: 'desc', value },
    ];
    if (/^\d+$/.test(value)) {
      expressions.unshift({ kind: 'idPrefix', value });
    }
    return expressions.length === 1 ? expressions[0] : { kind: 'or', expressions };
  }

  async function refreshMentionCandidates(query: string, requestId: number) {
    const tab = $activeTab;
    if (!tab) {
      mentionCandidates = [];
      mentionOpen = false;
      return;
    }

    mentionLoading = true;
    try {
      const page = await documentRuntime.query<CardSearchPage>(tab.id, {
        kind: 'search',
        expression: mentionSearchExpression(query),
        page: 1,
        pageSize: 8,
      });
      if (requestId !== mentionRequestId || $activeTab?.id !== tab.id) return;
      mentionCandidates = page.cards;
      mentionOpen = Boolean(mentionToken);
    } catch {
      if (requestId !== mentionRequestId || $activeTab?.id !== tab.id) return;
      mentionCandidates = [];
      mentionOpen = false;
    } finally {
      if (requestId === mentionRequestId) mentionLoading = false;
    }
  }

  function cancelMentionSearch() {
    if (mentionSearchTimer !== null) {
      clearTimeout(mentionSearchTimer);
      mentionSearchTimer = null;
    }
    mentionRequestId += 1;
    mentionLoading = false;
  }

  function scheduleMentionSearch(query: string) {
    if (mentionSearchTimer !== null) {
      clearTimeout(mentionSearchTimer);
    }
    const requestId = ++mentionRequestId;
    mentionLoading = true;
    mentionCandidates = [];
    mentionSearchTimer = setTimeout(() => {
      mentionSearchTimer = null;
      void refreshMentionCandidates(query, requestId);
    }, MENTION_SEARCH_DEBOUNCE_MS);
  }

  function syncComposerCardContextRefs(value: string) {
    const thread = activeThread;
    if (!thread) return;
    const cardRefs = thread.contextRefs.filter((ref) => ref.type === 'card');
    if (!cardRefs.length) return;

    const keptCardRefs = filterCardMentionContextRefsForText(value, cardRefs);
    if (keptCardRefs.length === cardRefs.length) return;
    upsertAiThread({
      ...thread,
      contextRefs: [
        ...thread.contextRefs.filter((ref) => ref.type !== 'card'),
        ...keptCardRefs,
      ],
    });
  }

  function updateMentionMenu(value?: string) {
    const input = composerInput;
    value = typeof value === 'string' ? value : input?.value ?? composer;
    composer = value;
    const token = findCardMentionToken(value, input?.selectionStart ?? value.length);
    mentionToken = token;
    mentionOpen = Boolean(token);
    if (token) {
      scheduleMentionSearch(token.query);
    } else {
      cancelMentionSearch();
      mentionCandidates = [];
    }
  }

  function handleComposerInput() {
    const value = composerInput?.value ?? composer;
    syncComposerCardContextRefs(value);
    updateMentionMenu(value);
  }

  function addCardContext(card: CardDataEntry) {
    const thread = ensureThread();
    upsertAiThread({
      ...thread,
      contextRefs: mergeWorkspaceAiContextRefs(thread.contextRefs, [
        createCardMentionContextRef(card, {
          documentId: $activeTab?.id,
          cdbPath: $activeTab?.path,
        }),
      ]),
    });
  }

  function selectMentionCard(card: CardDataEntry) {
    const token = mentionToken;
    if (!token) return;
    const next = replaceCardMention(composer, token, cardMentionLabel(card));
    composer = next.text;
    addCardContext(card);
    cancelMentionSearch();
    mentionOpen = false;
    mentionToken = null;
    mentionCandidates = [];
    setTimeout(() => {
      composerInput?.focus();
      composerInput?.setSelectionRange(next.cursor, next.cursor);
    });
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if ((event.key === 'Backspace' || event.key === 'Delete') && composerInput) {
      const range = findCardMentionDeleteRange(
        composer,
        composerInput.selectionStart,
        composerInput.selectionEnd,
        cardContextRefs,
        event.key,
      );
      if (range) {
        event.preventDefault();
        const next = removeCardMentionRange(composer, range);
        composer = next.text;
        syncComposerCardContextRefs(next.text);
        cancelMentionSearch();
        mentionOpen = false;
        mentionToken = null;
        mentionCandidates = [];
        setTimeout(() => {
          composerInput?.focus();
          composerInput?.setSelectionRange(next.cursor, next.cursor);
        });
        return;
      }
    }

    if (mentionOpen && event.key === 'Escape') {
      cancelMentionSearch();
      mentionOpen = false;
      return;
    }
    if (mentionOpen && mentionCandidates.length && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      selectMentionCard(mentionCandidates[0]);
    }
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

  function stopAiTextShortcut(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      event.stopPropagation();
    }
  }

  function stopAiTextShortcuts(node: HTMLElement) {
    node.addEventListener('keydown', stopAiTextShortcut, { capture: true });
    return {
      destroy() {
        node.removeEventListener('keydown', stopAiTextShortcut, { capture: true });
      },
    };
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
    const ownerId = $activeTab?.id;
    if (!content || isRunning || !ownerId || !workspaceMetadataState.ready) return;
    const metadataIsCurrent = captureWorkspaceMetadataScope();
    const thread = ensureThread();
    const ownsWorkspace = () => !isDisposed && metadataIsCurrent()
      && $activeTab?.id === ownerId && Boolean(documentRuntime.getDocument(ownerId))
      && getAiThreads().some(candidate => candidate.id === thread.id);

    appendAiMessage({ threadId: thread.id, role: 'user', content });
    const mentionContextPrompt = buildMentionContextPrompt(thread.contextRefs);
    composer = '';
    isRunning = true;
    stage = 'requesting_model';
    const controller = new AbortController();
    const announcedStages = new Set<string>();
    abortController = controller;
    ownsRunningWorkspace = ownsWorkspace;

    const appendRunEvent = (message: string) => {
      if (!ownsWorkspace() || controller.signal.aborted) return;
      appendAiMessage({ threadId: thread.id, role: 'event', content: message });
    };

    try {
      const result = await runWorkspaceAgent({
        threadId: thread.id,
        instruction: mentionContextPrompt ? `${mentionContextPrompt}\n\n用户指令：\n${content}` : content,
        history: thread.messages,
        context: createAiAppContext(ownerId),
        signal: controller.signal,
        onStageChange: (nextStage) => {
          if (!ownsWorkspace() || controller.signal.aborted) return;
          stage = nextStage;
          if (!announcedStages.has(nextStage)) {
            announcedStages.add(nextStage);
            appendRunEvent($_(`surface.ai_stage_${nextStage}`));
          }
        },
        onToolCall: (event) => {
          if (!ownsWorkspace() || controller.signal.aborted) return;
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
          if (!ownsWorkspace() || controller.signal.aborted) return;
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
      if (!ownsWorkspace() || controller.signal.aborted) return;
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
        if (fullAccess) {
          await applyProposal(result.proposal);
        }
      }
      if (!ownsWorkspace()) return;
      accumulateAiThreadTokenUsage({
        threadId: thread.id,
        promptTokens: result.tokenUsage.promptTokens,
        completionTokens: result.tokenUsage.completionTokens,
        totalTokens: result.tokenUsage.totalTokens,
      });
    } catch (error) {
      if (!ownsWorkspace()) return;
      appendAiMessage({
        threadId: thread.id,
        role: 'assistant',
        content: controller.signal.aborted
          ? $_('surface.ai_cancelled')
          : error instanceof Error ? error.message : 'AI request failed',
      });
    } finally {
      if (abortController === controller) {
        isRunning = false;
        stage = '';
        abortController = null;
        ownsRunningWorkspace = null;
      }
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

  const proposalApplier = createAiProposalApplier({
    applyPatch: createAiPatchApplier({
      confirmConflict: () => tauriBridge.ask($_('surface.ai_before_mismatch_confirm'), {
        title: $_('surface.ai_title'), kind: 'warning',
      }),
      undoLabel: () => $_('surface.ai_title'),
    }),
    updateStatus: updateAiProposalStatus,
  });

  async function applyProposal(proposal: WorkspaceAiProposal, singlePatch?: WorkspaceAiPatch) {
    if (!workspaceMetadataState.ready) return;
    try {
      const result = await proposalApplier.apply({
        proposal, singlePatch, ownerPath: workspaceMetadataState.cdbPath, fullAccess,
      });
      if (!result) return;
      showToast(result.ok ? $_('surface.ai_apply_success') : result.message, result.ok ? 'success' : 'error');
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  $effect(() => {
    void loadAppSettings();
  });

  $effect(() => {
    const tabId = $activeTab?.id ?? '';
    if (tabId === mentionTabId) return;
    mentionTabId = tabId;
    cancelMentionSearch();
    mentionToken = null;
    mentionCandidates = [];
    mentionOpen = false;
  });

  $effect(() => {
    if (abortController && ownsRunningWorkspace && !ownsRunningWorkspace()) cancelRun();
  });

  onDestroy(() => {
    isDisposed = true;
    cancelRun();
    cancelMentionSearch();
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

<section class="ai-surface" use:stopAiTextShortcuts>
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
            <div class="message-content">{@html renderMarkdown(message.content)}</div>
          </article>
        {/if}
      {:else}
        <div class="empty-message">{$_('surface.ai_message_empty')}</div>
      {/each}
    </div>

    <footer class="ai-compose">
      <div class="composer-shell">
        {#if cardContextRefs.length}
          <div class="context-chips">
            {#each cardContextRefs as ref}
              <span>{ref.label}</span>
            {/each}
          </div>
        {/if}
        <div class="composer-input-wrap">
        <textarea
          bind:this={composerInput}
          class="composer-input"
          bind:value={composer}
          placeholder={$_('surface.ai_composer_placeholder')}
          oninput={handleComposerInput}
          onmouseup={() => updateMentionMenu()}
          onkeydown={handleComposerKeydown}
          onblur={() => {
            cancelMentionSearch();
            setTimeout(() => { mentionOpen = false; }, 120);
          }}
        ></textarea>
          {#if mentionOpen}
            <div class="mention-menu">
              {#if mentionCandidates.length}
                {#each mentionCandidates as card}
                  <button type="button" onmousedown={(event) => { event.preventDefault(); selectMentionCard(card); }}>
                    <strong>{card.name || card.code}</strong>
                    <small>{card.code}</small>
                  </button>
                {/each}
              {:else}
                <span>{mentionLoading ? '...' : '-'}</span>
              {/if}
            </div>
          {/if}
        </div>
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

  <AiProposalInspector {proposals} cdbName={$activeTab?.name ?? '-'} onApply={applyProposal} />
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
  .ai-thread {
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
  .compose-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rail-title,
  .ai-header {
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
  .empty-note {
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

  .message > strong {
    display: block;
    margin-bottom: 6px;
    color: var(--ai-muted);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  .message-content,
  .empty-message {
    line-height: 1.55;
    word-break: break-word;
  }

  .message-content :global(pre) {
    margin: 8px 0;
    padding: 9px 10px;
    overflow: auto;
    border-radius: 6px;
    background: var(--bg-base);
  }

  .message-content :global(code) {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--bg-base);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
  }

  .message-content :global(pre code) {
    padding: 0;
    background: transparent;
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

  .context-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .context-chips span {
    max-width: 15rem;
    overflow: hidden;
    padding: 0.22rem 0.48rem;
    border: 1px solid var(--ai-line);
    border-radius: 999px;
    color: var(--ai-muted);
    font-size: 0.76rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .composer-input-wrap {
    position: relative;
    min-width: 0;
  }

  .composer-input {
    width: 100%;
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

  .mention-menu {
    position: absolute;
    z-index: 8;
    left: 0;
    right: 0;
    bottom: calc(100% + 8px);
    max-height: 240px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--ai-line);
    border-radius: 8px;
    background: var(--bg-surface);
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.28);
  }

  .mention-menu button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0.46rem 0.52rem;
    text-align: left;
    background: transparent;
  }

  .mention-menu button:hover {
    background: var(--bg-surface-hover);
  }

  .mention-menu strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mention-menu small,
  .mention-menu span {
    color: var(--ai-muted);
    font-size: 0.76rem;
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

  .run-button {
    color: #fff;
    background: var(--ai-accent);
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

  @media (max-width: 1180px) {
    .ai-surface {
      grid-template-columns: 200px minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) minmax(260px, 40vh);
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
    .ai-compose {
      grid-template-columns: minmax(0, 1fr);
    }

    .model-row {
      justify-content: flex-start;
    }

  }
</style>
