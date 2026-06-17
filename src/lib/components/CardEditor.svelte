<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import { activeTab, activeTabId, isDbLoaded, saveCdbFile } from "$lib/stores/db";
  import { clearSelection, editorState, getAllCards, getAllCardsMap, getTotalCards, handleReset, handleSearch, setSingleSelectedCard } from "$lib/stores/editor.svelte";
  import { showToast } from "$lib/stores/toast.svelte";
  import type { CardDataEntry } from "$lib/types";
  import { normalizeSetcodeHex, updateSetcode } from "$lib/utils/setcode";
  import { cloneEditableCard, createEmptyCard, getPackedLevel, normalizeEditableScaleValue, setPackedLevel } from "$lib/utils/card";
  import { createCardSnapshot } from "$lib/domain/card/draft";
  import { dispatchAppShortcut } from "$lib/utils/shortcuts";
  import { isEditableTarget } from "$lib/features/shell/controller";
  import { shellBackgroundTaskState } from "$lib/features/shell/dialogsController.svelte";
  import { appSettingsState } from "$lib/stores/appSettings.svelte";
  import { isShortcutEvent } from "$lib/features/shortcuts/registry";
  import {
    CARD_LIST_PAGE_SIZE,
    createDraftUndoHistory,
    handleCardEditorKeydown,
    resolvePageNavigationTarget,
    resolveSelectionNavigationTarget,
    stepBackDraftUndoHistory,
    type DraftUndoEntry,
  } from "$lib/features/card-editor/controller";
  import { deleteDraftCardFlow, modifyDraftCardFlow, saveAsDraftCardFlow, saveDraftCardFlow } from "$lib/features/card-editor/useCases";
  import { createCardEditorLifecycleController, setupCardEditorOnMount, syncDefaultCoverSourceEffect, syncLoadedDraftEffect, syncWorkspaceLifecycleEffect, teardownCardEditorOnDestroy, trackDraftUndoEffect } from "$lib/features/card-editor/lifecycle";
  import { handleResetSearch, handleSearchFromDraft } from "$lib/features/card-editor/searchController";
  import CardEditorFooter from "$lib/features/card-editor/components/CardEditorFooter.svelte";
  import CardEditorForm from "$lib/features/card-editor/components/CardEditorForm.svelte";
  import CardEditorHeader from "$lib/features/card-editor/components/CardEditorHeader.svelte";
  import CardImagePreview from "$lib/features/card-editor/components/CardImagePreview.svelte";
  import WorkbenchContributions from "$lib/platform/components/WorkbenchContributions.svelte";
  import { dispatchWorkbenchAction } from "$lib/platform";
  import type { CardWorkbenchContext } from "$lib/modules/card/workbench/context";

  const SETCODE_SLOT_INDICES = [0, 1, 2, 3] as const;
  const initialDraftCard = createEmptyCard();

  let editorRoot = $state<HTMLDivElement | null>(null);
  let draftCard = $state<CardDataEntry>(initialDraftCard);
  let originalCardCode = $state<number | null>(null);
  let imageSrc = $state<string>("/resources/cover.jpg");
  let setcodeHexes = $state<string[]>(["", "", "", ""]);
  let popularSetcodes = $state<{ value: string; label: string }[]>([]);
  let imageRequestToken = 0;
  let isImagePreviewOpen = $state(false);
  let imageClickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSyncedSelectedId: number | null = null;
  let lastLoadedCardSnapshot = $state("");
  let lastDefaultCoverSrc = $state("/resources/cover.jpg");
  let isKeyboardNavigating = $state(false);
  let draftUndoHistory = $state.raw<DraftUndoEntry[]>(createDraftUndoHistory(initialDraftCard));
  let trackedDraftSnapshot = $state(createCardSnapshot(initialDraftCard));
  let suspendDraftUndoTracking = 0;

  const lifecycleController = createCardEditorLifecycleController({
    getCoverImageSrc: () => appSettingsState.coverImageSrc,
    getDraftCard: () => draftCard,
    setDraftCard: (card) => {
      draftCard = card;
    },
    getOriginalCardCode: () => originalCardCode,
    setOriginalCardCode: (code) => {
      originalCardCode = code;
    },
    getLastLoadedCardSnapshot: () => lastLoadedCardSnapshot,
    setLastLoadedCardSnapshot: (snapshot) => {
      lastLoadedCardSnapshot = snapshot;
    },
    setLastSyncedSelectedId: (code) => {
      lastSyncedSelectedId = code;
    },
    setSetcodeHexAt: (index, value) => {
      setcodeHexes[index] = value;
    },
    setTrackedDraftSnapshot: (snapshot) => {
      trackedDraftSnapshot = snapshot;
    },
    setDraftUndoHistory: (history) => {
      draftUndoHistory = history;
    },
    mutateSuspendDraftUndoTracking: (delta) => {
      suspendDraftUndoTracking += delta;
    },
    nextImageRequestToken: () => ++imageRequestToken,
    isLatestImageRequestToken: (token) => token === imageRequestToken,
    clearPendingImageClick: () => {
      if (imageClickTimer) {
        clearTimeout(imageClickTimer);
        imageClickTimer = null;
      }
    },
    getImageSrc: () => imageSrc,
    setImageSrc: (src) => {
      imageSrc = src;
    },
    getActiveCdbPath: () => $activeTab?.path,
    isDbLoaded: () => $isDbLoaded,
    saveCdbFile,
    t: (key, options) => $_(key, options as never),
  });

  const isEditingExisting = $derived(originalCardCode !== null);
  const isLink = $derived((draftCard.type & 0x4000000) !== 0);
  const isPend = $derived((draftCard.type & 0x1000000) !== 0);
  const popularSetcodeValues = $derived.by(() => new Set(popularSetcodes.map((option) => option.value)));
  const backgroundTaskLabel = $derived.by(() => {
    if (!shellBackgroundTaskState.task) return "";
    return shellBackgroundTaskState.task === "merge"
      ? $_("editor.background_merge_running")
      : $_(shellBackgroundTaskState.format === "ypk" ? "editor.background_package_ypk_running" : "editor.background_package_zip_running");
  });
  const backgroundTaskProgressText = $derived.by(() => shellBackgroundTaskState.total <= 0 ? "" : `${shellBackgroundTaskState.current}/${shellBackgroundTaskState.total}`);
  const backgroundQueuedCount = $derived(shellBackgroundTaskState.queue.length);
  const cardWorkbenchContext = $derived.by((): CardWorkbenchContext => ({
    activeCdbPath: $activeTab?.path ?? null,
    activeDocumentId: $activeTabId,
    draftCard,
    imageSrc,
    isEditingExisting,
    t: (key, options) => $_(key, options as never),
    setImageSrc: (value) => {
      imageSrc = value;
    },
    setDraftCard: (card) => {
      draftCard = cloneEditableCard(card);
      lifecycleController.syncSetcodesFromCard(draftCard);
    },
    syncSetcodesFromCard: lifecycleController.syncSetcodesFromCard,
    refreshDraftImage: lifecycleController.refreshDraftImage,
    handleSearch,
    handleModify,
    handleNewCard,
    loadCardIntoDraft: lifecycleController.loadCardIntoDraft,
  }));

  function toShortcutElement(target: EventTarget | null) {
    if (target instanceof HTMLElement) return target;
    if (target instanceof Node) return target.parentElement;
    return null;
  }

  function isNativeTextUndoTarget(target: EventTarget | null) {
    const candidate = toShortcutElement(target) ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!candidate) return false;
    if (candidate.closest(".monaco-editor, .monaco-diff-editor")) return true;
    if (candidate instanceof HTMLTextAreaElement || candidate.isContentEditable) return true;
    if (candidate instanceof HTMLInputElement) {
      const type = candidate.type.toLowerCase();
      return !["button", "checkbox", "color", "file", "image", "radio", "range", "reset", "submit"].includes(type);
    }
    return Boolean(candidate.closest('[contenteditable="true"]'));
  }

  function isCardEditorShortcutTarget(target: EventTarget | null) {
    if (!editorRoot) return false;
    const candidate = toShortcutElement(target) ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    return Boolean(candidate && editorRoot.contains(candidate));
  }

  function handleDraftUndo() {
    const previousCode = Number(draftCard.code ?? 0);
    const result = stepBackDraftUndoHistory(draftUndoHistory);
    if (!result.card) return false;

    draftUndoHistory = result.history;
    lifecycleController.replaceDraftCardWithoutUndo(result.card);

    const nextCode = Number(draftCard.code ?? 0);
    if (nextCode !== previousCode) {
      void lifecycleController.refreshDraftImage(nextCode);
    }
    return true;
  }

  function handleSetcodeSelectChange(index: number, value: string) {
    if (value === "") {
      setcodeHexes[index] = "";
      draftCard.setcode = updateSetcode(draftCard.setcode, index, "");
      return;
    }
    if (value === "__custom__") return;

    setcodeHexes[index] = value.replace(/^0x/i, "");
    draftCard.setcode = updateSetcode(draftCard.setcode, index, value);
  }

  function handleSetcodeHexChange(index: number, value: string) {
    const normalized = normalizeSetcodeHex(value);
    setcodeHexes[index] = normalized;
    draftCard.setcode = updateSetcode(draftCard.setcode, index, normalized ? `0x${normalized}` : "");
  }

  function updateDraftLevel(nextLevel: number) {
    const safeLevel = Math.max(0, Math.min(13, Number.isFinite(nextLevel) ? nextLevel : 0));
    draftCard.level = setPackedLevel(safeLevel, draftCard.lscale, draftCard.rscale);
  }

  function updateDraftScale(side: "left" | "right", nextScale: number) {
    const safeScale = nextScale === -1 ? -1 : normalizeEditableScaleValue(nextScale);
    if (side === "left") draftCard.lscale = safeScale;
    else draftCard.rscale = safeScale;

    draftCard.level = setPackedLevel(getPackedLevel(draftCard.level), normalizeEditableScaleValue(draftCard.lscale), normalizeEditableScaleValue(draftCard.rscale));
  }

  function isDraftDirty() {
    return lifecycleController.isDraftDirty();
  }

  async function confirmDiscardDraftForKeyboardNavigation() {
    return lifecycleController.confirmDiscardDraftForKeyboardNavigation();
  }

  async function handleSaveWorkspace() {
    if (!$activeTabId) return false;
    return lifecycleController.handleSaveWorkspace(handleModify);
  }

  async function handleEditorKeydown(event: KeyboardEvent) {
    if (isShortcutEvent('cardEditor.undoDraft', event, appSettingsState.values.shortcutBindings) && !isImagePreviewOpen && isCardEditorShortcutTarget(event.target) && !isNativeTextUndoTarget(event.target)) {
      if (handleDraftUndo()) event.preventDefault();
      return;
    }

    await handleCardEditorKeydown(event, {
      isDbLoaded: $isDbLoaded,
      isKeyboardNavigating,
      isParseModalOpen: false,
      isCardImageDrawerOpen: false,
      isImagePreviewOpen,
      isEditableTarget,
      confirmDiscardDraft: confirmDiscardDraftForKeyboardNavigation,
      onModify: handleModify,
      getSelectionTarget: (delta) => resolveSelectionNavigationTarget({ cards: getAllCards(), selectedId: editorState.selectedId, delta }),
      selectCard: setSingleSelectedCard,
      getPageTarget: (delta) => resolvePageNavigationTarget({ totalCards: getTotalCards(), currentPage: editorState.currentPage, delta, pageSize: CARD_LIST_PAGE_SIZE }),
      setCurrentPage: (page) => {
        editorState.currentPage = page;
      },
      runSearch: async () => {
        await handleSearch();
      },
      setKeyboardNavigating: (value) => {
        isKeyboardNavigating = value;
      },
      shortcutBindings: appSettingsState.values.shortcutBindings,
    });
  }

  async function saveDraftCard(targetCode: number, removeOriginal = false) {
    draftCard.code = targetCode;
    return saveDraftCardFlow({
      draftCard,
      originalCardCode,
      removeOriginal,
      t: (key, options) => $_(key, options as never),
      setDraftCard: (card) => {
        draftCard = cloneEditableCard(card);
        lifecycleController.syncSetcodesFromCard(draftCard);
      },
      setOriginalCardCode: (code) => {
        originalCardCode = code;
      },
      setLastSyncedSelectedId: (code) => {
        lastSyncedSelectedId = code;
      },
      setLastLoadedCardSnapshot: (snapshot) => {
        lastLoadedCardSnapshot = snapshot;
      },
      handleSearch,
      refreshDraftImage: lifecycleController.refreshDraftImage,
    });
  }

  async function handleModify() {
    if (!$isDbLoaded) return;
    await modifyDraftCardFlow({ draftCard, originalCardCode, isEditingExisting, t: (key, options) => $_(key, options as never), saveDraftCard });
  }

  async function handleSaveAs() {
    if (!$isDbLoaded) return;
    await saveAsDraftCardFlow({ draftCard, originalCardCode, t: (key, options) => $_(key, options as never), saveDraftCard });
  }

  async function handleDelete() {
    if (!$isDbLoaded || originalCardCode === null) return;
    await deleteDraftCardFlow({ originalCardCode, t: (key, options) => $_(key, options as never), resetDraftCard: lifecycleController.resetDraftCard, clearSelection, handleSearch });
  }

  function handleNewCard() {
    clearSelection();
    lifecycleController.handleNewCard();
  }

  async function runSearchFromDraft() {
    await handleSearchFromDraft({
      isDbLoaded: $isDbLoaded,
      draftCard,
      setSearchFilters: (filters) => {
        editorState.searchFilters = filters;
      },
      runSearch: handleSearch,
    });
  }

  async function runResetSearch() {
    await handleResetSearch({ isDbLoaded: $isDbLoaded, runReset: handleReset, clearSelection, resetDraftCard: lifecycleController.resetDraftCard });
  }

  onMount(() => setupCardEditorOnMount({
    t: (key, options) => $_(key, options as never),
    setPopularSetcodes: (options) => {
      popularSetcodes = options;
    },
    isDbLoaded: () => $isDbLoaded,
    handleNewCard,
    handleSearchFromDraft: runSearchFromDraft,
    handleEditorKeydown,
    cancelScriptGeneration: () => {
      // Optional modules own their own cancellable work.
    },
    disposeImageInteraction: () => {
      if (imageClickTimer) clearTimeout(imageClickTimer);
    },
  }));

  onDestroy(() => {
    teardownCardEditorOnDestroy({ handleEditorKeydown });
  });

  function handleImageClick() {
    if (imageClickTimer) clearTimeout(imageClickTimer);
    imageClickTimer = setTimeout(() => {
      imageClickTimer = null;
      dispatchWorkbenchAction('card-image.pick');
    }, 220);
  }

  function handleImageDoubleClick(event: MouseEvent) {
    event.preventDefault();
    if (imageClickTimer) {
      clearTimeout(imageClickTimer);
      imageClickTimer = null;
    }
    if (imageSrc) isImagePreviewOpen = true;
  }

  function closeImagePreview() {
    isImagePreviewOpen = false;
  }

  async function handleSave() {
    const ok = await saveCdbFile();
    showToast($_(ok ? "editor.save_success" : "editor.save_failed"), ok ? "success" : "error");
  }

  $effect(() => {
    trackDraftUndoEffect({
      draftCard,
      suspendDraftUndoTracking,
      trackedDraftSnapshot,
      draftUndoHistory,
      setTrackedDraftSnapshot: (snapshot) => {
        trackedDraftSnapshot = snapshot;
      },
      setDraftUndoHistory: (history) => {
        draftUndoHistory = history;
      },
    });
  });

  $effect(() => {
    syncLoadedDraftEffect({
      isDbLoaded: $isDbLoaded,
      selectedId: editorState.selectedId,
      selectedCard: getAllCardsMap().get(editorState.selectedId ?? -1) ?? null,
      lastSyncedSelectedId,
      lastLoadedCardSnapshot,
      originalCardCode,
      loadCardIntoDraft: (card) => {
        untrack(() => {
          lifecycleController.loadCardIntoDraft(card);
        });
      },
      resetDraftCard: () => {
        untrack(() => {
          lifecycleController.resetDraftCard();
        });
      },
      refreshDraftImage: lifecycleController.refreshDraftImage,
    });
  });

  $effect(() => {
    syncDefaultCoverSourceEffect({
      nextCoverSrc: lifecycleController.getDefaultCoverSrc(),
      lastDefaultCoverSrc,
      imageSrc,
      setLastDefaultCoverSrc: (src) => {
        lastDefaultCoverSrc = src;
      },
      setImageSrc: (src) => {
        imageSrc = src;
      },
    });
  });

  $effect(() => {
    return syncWorkspaceLifecycleEffect({
      workspaceId: $activeTabId,
      workspaceDirty: ($activeTab?.isDirty ?? false) || isDraftDirty(),
      handleSaveWorkspace,
    });
  });
</script>

{#snippet extensionActions()}
  <WorkbenchContributions
    workbenchId="card.workbench"
    slot="footer-actions"
    context={cardWorkbenchContext}
  />
{/snippet}

{#if $isDbLoaded}
  <div class="editor-area" bind:this={editorRoot}>
    <CardEditorHeader {draftCard} saveLabel={$_("editor.save_db")} idLabel={$_("editor.id")} aliasLabel={$_("editor.alias")} nameLabel={$_("editor.name")} newCardLabel={$_("editor.new_card")} onSave={handleSave} onNewCard={handleNewCard} />

    <CardEditorForm
      {draftCard}
      {imageSrc}
      imageAriaLabel={$_("editor.card_image_picker_aria")}
      imageTitle={$_("editor.card_image_picker_title")}
      noImageLabel="📷"
      {isLink}
      {isPend}
      setcodeSlotIndices={SETCODE_SLOT_INDICES}
      {setcodeHexes}
      {popularSetcodes}
      {popularSetcodeValues}
      customSetcodeLabel={$_("editor.custom")}
      licenseLabel={$_("editor.license")}
      attributeLabel={$_("editor.attribute")}
      raceLabel={$_("editor.race")}
      levelLabel={$_("editor.level")}
      levelNoneLabel={$_("editor.level_none")}
      atkLabel={$_("editor.atk")}
      defLabel={$_("editor.def")}
      typesLabel={$_("editor.types")}
      descLabel={$_("editor.desc")}
      setcodesLabel={$_("editor.setcodes")}
      linkMarkersLabel={$_("editor.link_markers")}
      scaleLabel={$_("editor.scale")}
      scaleLeftLabel={$_("editor.scale_left")}
      scaleRightLabel={$_("editor.scale_right")}
      hintsLabel={$_("editor.hints")}
      onImageClick={handleImageClick}
      onImageDoubleClick={handleImageDoubleClick}
      onImageError={lifecycleController.handleImageError}
      onSetcodeSelectChange={handleSetcodeSelectChange}
      onSetcodeHexChange={handleSetcodeHexChange}
      onUpdateDraftLevel={updateDraftLevel}
      onUpdateDraftScale={updateDraftScale}
    />

    <CardEditorFooter
      {isEditingExisting}
      editingHint={$_("editor.editing_card", { values: { code: String(originalCardCode) } })}
      newCardHint={$_("editor.new_card_hint")}
      backgroundTaskLabel={backgroundTaskLabel}
      backgroundTaskProgressText={backgroundTaskProgressText}
      backgroundQueuedCount={backgroundQueuedCount}
      resetSearchLabel={$_("editor.reset_search")}
      newCardLabel={$_("editor.new_card")}
      searchLabel={$_("editor.search_from_draft")}
      saveAsLabel={$_("editor.save_as")}
      modifyLabel={$_("editor.modify")}
      deleteLabel={$_("editor.delete")}
      {extensionActions}
      onNewCard={handleNewCard}
      onResetSearch={runResetSearch}
      onSearch={() => dispatchAppShortcut("search-from-draft")}
      onSaveAs={handleSaveAs}
      onModify={handleModify}
      onDelete={handleDelete}
    />
  </div>
{/if}

<CardImagePreview open={isImagePreviewOpen} {imageSrc} closeAriaLabel={$_("editor.card_image_preview_close")} dialogAriaLabel={$_("editor.card_image_preview_dialog")} previewAlt={$_("editor.card_image_preview_alt")} onClose={closeImagePreview} />

<style>
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    min-width: 0;
    overflow: hidden;
  }
</style>
