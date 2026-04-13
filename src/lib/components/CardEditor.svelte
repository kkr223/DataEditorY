<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    activeTab,
    activeTabId,
    isDbLoaded,
    saveCdbFile,
  } from "$lib/stores/db";
  import { clearSelection, editorState, getAllCards, getAllCardsMap, getTotalCards, handleReset, handleSearch, setSingleSelectedCard } from "$lib/stores/editor.svelte";
  import { showToast } from "$lib/stores/toast.svelte";
  import { tauriBridge } from "$lib/infrastructure/tauri";
  import type { CardDataEntry } from "$lib/types";
  import {
    getSetcode,
    loadPopularSetcodes,
    normalizeSetcodeHex,
    updateSetcode,
  } from "$lib/utils/setcode";
  import {
    createEmptyCard,
    getPackedLevel,
    normalizeEditableScaleValue,
    setPackedLevel,
  } from "$lib/utils/card";
  import { createCardSnapshot } from "$lib/domain/card/draft";
  import { APP_SHORTCUT_EVENT } from "$lib/utils/shortcuts";
  import { isEditableTarget } from "$lib/features/shell/controller";
  import { shellBackgroundTaskState } from "$lib/features/shell/dialogsController.svelte";
  import { isCapabilityEnabled } from "$lib/application/capabilities/registry";
  import {
    clearWorkspaceLifecycleMetadata,
    clearWorkspaceSaveHandler,
    confirmDirtyPrompt,
    setWorkspaceLifecycleMetadata,
    setWorkspaceSaveHandler,
  } from "$lib/application/workspace/lifecycle";
  import { appSettingsState } from "$lib/stores/appSettings.svelte";
  import { getScriptGenerationStageLabel, type ScriptGenerationStage } from "$lib/services/scriptGenerationStages";
  import { resolveCardImageSrc } from "$lib/services/cardImageService";
  import {
    buildSearchFiltersFromDraft,
    buildEmptyDraftState,
    buildLoadedDraftState,
    CARD_LIST_PAGE_SIZE,
    createCardImageInteractionController,
    createCardScriptGenerationController,
    createCardScriptGenerationState,
    createInitialParseManuscript,
    handleCardEditorKeydown,
    handleParseModalBackdropDismiss,
    isDraftDirty as isDraftStateDirty,
    resolvePageNavigationTarget,
    resolveSelectionNavigationTarget,
  } from "$lib/features/card-editor/controller";
  import {
    deleteDraftCardFlow,
    modifyDraftCardFlow,
    openCardScriptFlow,
    saveAsDraftCardFlow,
    saveDraftCardFlow,
  } from "$lib/features/card-editor/useCases";
  import CardEditorFooter from "$lib/features/card-editor/components/CardEditorFooter.svelte";
  import CardEditorForm from "$lib/features/card-editor/components/CardEditorForm.svelte";
  import CardEditorHeader from "$lib/features/card-editor/components/CardEditorHeader.svelte";
  import CardImagePreview from "$lib/features/card-editor/components/CardImagePreview.svelte";

  type CardEditorExtraUseCasesModule = typeof import("$lib/features/card-editor/extraUseCases");
  type CardParseDialogModule = typeof import("$lib/features/card-editor/components/CardParseDialog.svelte");
  type CardImageDrawerHostModule = typeof import("$lib/features/card-editor/components/CardImageDrawerHost.svelte");

  const SETCODE_SLOT_INDICES = [0, 1, 2, 3] as const;
  const hasAiCapability = isCapabilityEnabled("ai");
  const hasCardImageCapability = isCapabilityEnabled("card-image");
  const loadCardEditorExtraUseCases = __APP_FEATURES__.ai || __APP_FEATURES__.cardImage
    ? () => import("$lib/features/card-editor/extraUseCases")
    : null;
  const loadCardParseDialogModule = __APP_FEATURES__.ai
    ? () => import("$lib/features/card-editor/components/CardParseDialog.svelte")
    : null;
  const loadCardImageDrawerHostModule = __APP_FEATURES__.cardImage
    ? () => import("$lib/features/card-editor/components/CardImageDrawerHost.svelte")
    : null;


  let draftCard = $state<CardDataEntry>(createEmptyCard());
  let originalCardCode = $state<number | null>(null);
  let imageSrc = $state<string>("/resources/cover.jpg");
  let setcodeHexes = $state<string[]>(["", "", "", ""]);
  let popularSetcodes = $state<{ value: string; label: string }[]>([]);
  let imageRequestToken = 0;
  const imageInteraction = $state({
    isPreviewOpen: false,
    isDrawerOpen: false,
  });
  let lastSyncedSelectedId: number | null = null;
  let lastLoadedCardSnapshot = $state("");
  let lastDefaultCoverSrc = $state("/resources/cover.jpg");
  let isParseModalOpen = $state(false);
  let aiInteractionMode = $state<"parse" | "instruction">("parse");
  let manuscriptInput = $state("");
  let isParsingManuscript = $state(false);
  let aiInteractionResult = $state("");
  let cardEditorExtraUseCasesPromise = $state<Promise<CardEditorExtraUseCasesModule> | null>(null);
  let cardParseDialogModulePromise = $state<Promise<CardParseDialogModule> | null>(null);
  let cardImageDrawerHostModulePromise = $state<Promise<CardImageDrawerHostModule> | null>(null);
  const scriptGeneration = $state(createCardScriptGenerationState());
  let isKeyboardNavigating = $state(false);

  const imageInteractionController = createCardImageInteractionController({
    onPickImage: () => handleImagePick(),
    hasImageSrc: () => Boolean(imageSrc),
    hasCardImageCapability: () => hasCardImageCapability,
    setPreviewOpen: (value) => {
      imageInteraction.isPreviewOpen = value;
    },
    setDrawerOpen: (value) => {
      imageInteraction.isDrawerOpen = value;
    },
  });

  const scriptGenerationController = createCardScriptGenerationController(scriptGeneration);

  let isEditingExisting = $derived(originalCardCode !== null);
  let isLink = $derived((draftCard.type & 0x4000000) !== 0);
  let isPend = $derived((draftCard.type & 0x1000000) !== 0);
  let popularSetcodeValues = $derived.by(() => new Set(popularSetcodes.map((option) => option.value)));
  let backgroundTaskLabel = $derived.by(() => {
    if (!shellBackgroundTaskState.task) {
      return "";
    }

    return shellBackgroundTaskState.task === "merge"
      ? $_("editor.background_merge_running")
      : $_(
          shellBackgroundTaskState.format === "ypk"
            ? "editor.background_package_ypk_running"
            : "editor.background_package_zip_running",
        );
  });
  let backgroundTaskProgressText = $derived.by(() => {
    if (shellBackgroundTaskState.total <= 0) {
      return "";
    }

    return `${shellBackgroundTaskState.current}/${shellBackgroundTaskState.total}`;
  });
  let backgroundQueuedCount = $derived(shellBackgroundTaskState.queue.length);

  function getDefaultCoverSrc() {
    return appSettingsState.coverImageSrc || "/resources/cover.jpg";
  }

  function ensureCardEditorExtraUseCases() {
    if (!loadCardEditorExtraUseCases || (!hasAiCapability && !hasCardImageCapability)) {
      return null;
    }
    cardEditorExtraUseCasesPromise ??= loadCardEditorExtraUseCases();
    return cardEditorExtraUseCasesPromise;
  }

  function ensureCardParseDialogModule() {
    if (!loadCardParseDialogModule || !hasAiCapability) {
      return null;
    }
    cardParseDialogModulePromise ??= loadCardParseDialogModule();
    return cardParseDialogModulePromise;
  }

  function ensureCardImageDrawerHostModule() {
    if (!loadCardImageDrawerHostModule || !hasCardImageCapability) {
      return null;
    }
    cardImageDrawerHostModulePromise ??= loadCardImageDrawerHostModule();
    return cardImageDrawerHostModulePromise;
  }

  function syncSetcodesFromCard(card: CardDataEntry) {
    for (let i = 0; i < 4; i++) {
      setcodeHexes[i] = getSetcode(card.setcode, i).replace(/^0x/i, "");
    }
  }

  function handleSetcodeSelectChange(index: number, value: string) {
    if (value === "") {
      setcodeHexes[index] = "";
      draftCard.setcode = updateSetcode(draftCard.setcode, index, "");
      return;
    }

    if (value === "__custom__") {
      return;
    }

    setcodeHexes[index] = value.replace(/^0x/i, "");
    draftCard.setcode = updateSetcode(draftCard.setcode, index, value);
  }

  function handleSetcodeHexChange(index: number, value: string) {
    const normalized = normalizeSetcodeHex(value);
    setcodeHexes[index] = normalized;
    draftCard.setcode = updateSetcode(
      draftCard.setcode,
      index,
      normalized ? `0x${normalized}` : "",
    );
  }

  function updateDraftLevel(nextLevel: number) {
    const safeLevel = Math.max(0, Math.min(13, Number.isFinite(nextLevel) ? nextLevel : 0));
    draftCard.level = setPackedLevel(safeLevel, draftCard.lscale, draftCard.rscale);
  }

  function updateDraftScale(side: "left" | "right", nextScale: number) {
    const safeScale = nextScale === -1
      ? -1
      : normalizeEditableScaleValue(nextScale);
    if (side === "left") {
      draftCard.lscale = safeScale;
    } else {
      draftCard.rscale = safeScale;
    }

    draftCard.level = setPackedLevel(
      getPackedLevel(draftCard.level),
      normalizeEditableScaleValue(draftCard.lscale),
      normalizeEditableScaleValue(draftCard.rscale),
    );
  }

  function resetDraftCard() {
    const nextState = buildEmptyDraftState(getDefaultCoverSrc());
    lastSyncedSelectedId = nextState.lastSyncedSelectedId;
    lastLoadedCardSnapshot = nextState.lastLoadedCardSnapshot;
    originalCardCode = nextState.originalCardCode;
    draftCard = nextState.draftCard;
    syncSetcodesFromCard(draftCard);
    imageRequestToken++;
    imageInteractionController.clearPendingClick();
    imageSrc = nextState.imageSrc;
  }

  function isDraftDirty() {
    return isDraftStateDirty({
      draftCard,
      originalCardCode,
      lastLoadedCardSnapshot,
    });
  }

  async function confirmDiscardDraftForKeyboardNavigation() {
    if (!isDraftDirty()) return true;

    return confirmDirtyPrompt({
      message: $_("editor.navigate_unsaved_confirm"),
      title: $_("editor.navigate_unsaved_title"),
      kind: "warning",
    });
  }

  async function handleSaveWorkspace() {
    if (!$isDbLoaded || !$activeTabId) return false;

    if (isDraftDirty()) {
      await handleModify();
      if (isDraftDirty()) {
        return false;
      }
    }

    return saveCdbFile();
  }

  async function handleEditorKeydown(event: KeyboardEvent) {
    await handleCardEditorKeydown(event, {
      isDbLoaded: $isDbLoaded,
      isKeyboardNavigating,
      isParseModalOpen,
      isCardImageDrawerOpen: imageInteraction.isDrawerOpen,
      isImagePreviewOpen: imageInteraction.isPreviewOpen,
      isEditableTarget,
      confirmDiscardDraft: confirmDiscardDraftForKeyboardNavigation,
      onModify: handleModify,
      getSelectionTarget: (delta) => resolveSelectionNavigationTarget({
        cards: getAllCards(),
        selectedId: editorState.selectedId,
        delta,
      }),
      selectCard: setSingleSelectedCard,
      getPageTarget: (delta) => resolvePageNavigationTarget({
        totalCards: getTotalCards(),
        currentPage: editorState.currentPage,
        delta,
        pageSize: CARD_LIST_PAGE_SIZE,
      }),
      setCurrentPage: (page) => {
        editorState.currentPage = page;
      },
      runSearch: async () => {
        await handleSearch();
      },
      setKeyboardNavigating: (value) => {
        isKeyboardNavigating = value;
      },
    });
  }

  function loadCardIntoDraft(card: CardDataEntry) {
    const nextState = buildLoadedDraftState(card);
    lastSyncedSelectedId = nextState.lastSyncedSelectedId;
    lastLoadedCardSnapshot = nextState.lastLoadedCardSnapshot;
    originalCardCode = nextState.originalCardCode;
    draftCard = nextState.draftCard;
    syncSetcodesFromCard(draftCard);
  }

  function handleImageError(failedSrc: string) {
    if (imageSrc === failedSrc) {
      imageSrc = getDefaultCoverSrc();
    }
  }

  async function refreshDraftImage(code: number, bustCache = false) {
    if (!$activeTab?.path || code <= 0) {
      imageRequestToken++;
      imageInteractionController.clearPendingClick();
      imageSrc = getDefaultCoverSrc();
      return;
    }

    const requestToken = ++imageRequestToken;
    const src = await resolveCardImageSrc($activeTab.path, code, bustCache);
    if (requestToken === imageRequestToken) {
      imageSrc = src;
    }
  }

  async function saveDraftCard(targetCode: number, removeOriginal = false) {
    draftCard.code = targetCode;
    return saveDraftCardFlow({
      draftCard,
      originalCardCode,
      removeOriginal,
      t: (key, options) => $_(key, options as never),
      setDraftCard: (card) => {
        draftCard = card;
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
      refreshDraftImage,
    });
  }

  async function handleModify() {
    if (!$isDbLoaded) return;
    await modifyDraftCardFlow({
      draftCard,
      originalCardCode,
      isEditingExisting,
      t: (key, options) => $_(key, options as never),
      saveDraftCard,
    });
  }

  async function handleSaveAs() {
    if (!$isDbLoaded) return;
    await saveAsDraftCardFlow({
      draftCard,
      originalCardCode,
      t: (key, options) => $_(key, options as never),
      saveDraftCard,
    });
  }

  async function handleDelete() {
    if (!$isDbLoaded || originalCardCode === null) return;
    await deleteDraftCardFlow({
      originalCardCode,
      t: (key, options) => $_(key, options as never),
      resetDraftCard,
      clearSelection,
      handleSearch,
    });
  }

  async function handleSearchFromDraft() {
    if (!$isDbLoaded) return;
    editorState.searchFilters = buildSearchFiltersFromDraft(draftCard);
    await handleSearch(false, true);
  }

  async function handleResetSearch() {
    if (!$isDbLoaded) return;
    await handleReset();
    clearSelection();
    resetDraftCard();
  }

  function handleNewCard() {
    clearSelection();
    resetDraftCard();
  }

  onMount(() => {
    loadPopularSetcodes().then(({ options, duplicateSetcodes }) => {
      popularSetcodes = options;
      for (const code of duplicateSetcodes.slice(0, 3)) {
        showToast(
          $_("editor.setcode_duplicates_detected", {
            values: { code },
          }),
          "info",
          4500,
        );
      }
    });

    const handleShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== "new-card" || !$isDbLoaded) return;

      handleNewCard();
    };

    window.addEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
    window.addEventListener("keydown", handleEditorKeydown);
    return () => {
      scriptGenerationController.cancel();
      imageInteractionController.dispose();
      window.removeEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
      window.removeEventListener("keydown", handleEditorKeydown);
    };
  });

  onDestroy(() => {
    window.removeEventListener("keydown", handleEditorKeydown);
  });

  async function handleImagePick() {
    const extraModule = ensureCardEditorExtraUseCases();
    if (!extraModule) return;

    await (await extraModule).pickCardImageFlow({
      activeCdbPath: $activeTab?.path ?? null,
      draftCard,
      t: (key, options) => $_(key, options as never),
      setImageSrc: (src) => {
        imageSrc = src;
      },
    });
  }

  function handleImageClick() {
    imageInteractionController.handleImageClick();
  }

  function handleImageDoubleClick(event: MouseEvent) {
    imageInteractionController.handleImageDoubleClick(event);
  }

  function closeImagePreview() {
    imageInteractionController.closePreview();
  }

  function openCardImageDrawer() {
    imageInteractionController.openDrawer();
  }

  function closeCardImageDrawer() {
    imageInteractionController.closeDrawer();
  }

  async function handleCardImageSaved() {
    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) return;
    await refreshDraftImage(targetCode, true);
  }

  async function handleOpenScript() {
    await openCardScriptFlow({
      activeCdbPath: $activeTab?.path ?? null,
      activeTabId: $activeTabId,
      draftCard,
      t: (key, options) => $_(key, options as never),
    });
  }

  async function handleGenerateScript() {
    const extraModule = ensureCardEditorExtraUseCases();
    if (!extraModule) return;

    await (await extraModule).generateCardScriptFlow({
      activeCdbPath: $activeTab?.path ?? null,
      activeTabId: $activeTabId,
      draftCard,
      t: (key, options) => $_(key, options as never),
      setIsGeneratingScript: scriptGenerationController.setIsGenerating,
      setScriptGenerationStage: scriptGenerationController.setStage,
      setScriptGenerationAbortController: scriptGenerationController.setAbortController,
    });
  }

  function handleCancelGenerateScript() {
    scriptGenerationController.cancel();
  }

  async function saveParsedCardsIndividually(cards: CardDataEntry[]) {
    const extraModule = ensureCardEditorExtraUseCases();
    if (!extraModule) return false;

    return (await extraModule).saveParsedCardsIndividuallyFlow({
      cards,
      t: (key, options) => $_(key, options as never),
      loadCardIntoDraft,
      handleSearch,
      refreshDraftImage,
    });
  }

  async function handleOpenParseModal() {
    const extraModule = ensureCardEditorExtraUseCases();
    if (!extraModule) return;

    await (await extraModule).openParseModalFlow({
      hasAiCapability,
      draftCard,
      setManuscriptInput: (value) => {
        manuscriptInput = value;
      },
      setParseModalOpen: (value) => {
        isParseModalOpen = value;
      },
    });
    aiInteractionMode = "parse";
    aiInteractionResult = "";
    ensureCardParseDialogModule();
  }

  function closeParseModal() {
    if (isParsingManuscript) return;
    isParseModalOpen = false;
  }

  function handleAiInteractionModeChange(mode: "parse" | "instruction") {
    aiInteractionMode = mode;
    if (mode === "instruction") {
      aiInteractionResult = "";
      if (manuscriptInput.trim() === createInitialParseManuscript(draftCard)) {
        manuscriptInput = "";
      }
    }
  }

  function handleParseModalBackdropKeydown(event: KeyboardEvent) {
    handleParseModalBackdropDismiss(event, closeParseModal);
  }

  async function handleParseManuscriptConfirm() {
    const extraModule = ensureCardEditorExtraUseCases();
    if (!extraModule) return;

    if (aiInteractionMode === "instruction") {
      await (await extraModule).runEditorInstructionFlow({
        hasAiCapability,
        instruction: manuscriptInput,
        activeCdbPath: $activeTab?.path ?? null,
        currentCardCode: draftCard.code ?? null,
        currentCard: draftCard,
        t: (key, options) => $_(key, options as never),
        setIsRunning: (value) => {
          isParsingManuscript = value;
        },
        refreshAfterExecution: async () => {
          await handleSearch(true);
        },
        setLastResult: (value) => {
          aiInteractionResult = value;
        },
      });
      return;
    }

    await (await extraModule).parseCardManuscriptFlow({
      hasAiCapability,
      manuscriptInput,
      activeCdbPath: $activeTab?.path ?? null,
      currentCardCode: draftCard.code ?? null,
      prepareForImport: async () => {
        if (isEditingExisting) {
          handleNewCard();
          await tick();
        }
      },
      t: (key, options) => $_(key, options as never),
      setIsParsingManuscript: (value) => {
        isParsingManuscript = value;
      },
      setParseModalOpen: (value) => {
        isParseModalOpen = value;
      },
      setDraftCard: (card) => {
        draftCard = card;
      },
      syncSetcodesFromCard,
      afterDraftApplied: async () => {
        await tick();
      },
      handleModify,
      saveParsedCardsIndividually,
    });
  }

  async function handleSave() {
    const ok = await saveCdbFile();
    showToast($_(ok ? "editor.save_success" : "editor.save_failed"), ok ? "success" : "error");
  }


  $effect(() => {
    if (!$isDbLoaded) {
      untrack(() => {
        resetDraftCard();
      });
      return;
    }

    const selectedId = editorState.selectedId;
    const card = getAllCardsMap().get(selectedId ?? -1);
    if (card) {
      const nextSnapshot = createCardSnapshot(card);
      if (lastSyncedSelectedId !== card.code || lastLoadedCardSnapshot !== nextSnapshot) {
        untrack(() => {
          loadCardIntoDraft(card);
        });
        void refreshDraftImage(card.code);
      }
      return;
    }

    if (selectedId !== null) {
      return;
    }

    if (originalCardCode !== null) {
      untrack(() => {
        resetDraftCard();
      });
    }
  });

  $effect(() => {
    const nextCoverSrc = getDefaultCoverSrc();
    if (nextCoverSrc === lastDefaultCoverSrc) return;

    const previousCoverSrc = lastDefaultCoverSrc;
    lastDefaultCoverSrc = nextCoverSrc;
    if (imageSrc === previousCoverSrc) {
      imageSrc = nextCoverSrc;
    }
  });

  $effect(() => {
    if (hasAiCapability && isParseModalOpen) {
      ensureCardParseDialogModule();
    }
  });

  $effect(() => {
    if (hasCardImageCapability && imageInteraction.isDrawerOpen) {
      ensureCardImageDrawerHostModule();
    }
  });

  $effect(() => {
    const workspaceId = $activeTabId;
    const workspaceDirty = ($activeTab?.isDirty ?? false) || isDraftDirty();

    if (workspaceId) {
      setWorkspaceLifecycleMetadata(workspaceId, {
        dirty: workspaceDirty,
        closeGuard: workspaceDirty ? "confirm-dirty" : "none",
      });
      setWorkspaceSaveHandler(workspaceId, handleSaveWorkspace);
    }

    return () => {
      if (workspaceId) {
        clearWorkspaceLifecycleMetadata(workspaceId);
        clearWorkspaceSaveHandler(workspaceId);
      }
    };
  });
</script>

{#if $isDbLoaded}
  <div class="editor-area">
      <CardEditorHeader
        {draftCard}
        saveLabel={$_("editor.save_db")}
        idLabel={$_("editor.id")}
        aliasLabel={$_("editor.alias")}
      nameLabel={$_("editor.name")}
      newCardLabel={$_("editor.new_card")}
      onSave={handleSave}
      onNewCard={handleNewCard}
    />

    <CardEditorForm
      {draftCard}
      {imageSrc}
      imageAriaLabel="Single click to select image, double click to preview"
      imageTitle="单击更换图片，双击放大预览"
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
      onImageError={handleImageError}
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
      aiParseLabel={$_("editor.ai_parse_button")}
      scriptLabel={$_("editor.script_button")}
      generateScriptLabel={$_("editor.script_generate_button")}
      generatingScriptLabel={$_("editor.script_generating")}
      cancelScriptLabel={$_("editor.script_cancel_button")}
      cardImageLabel={$_("editor.card_image_button")}
      searchLabel={$_("editor.search_from_draft")}
      saveAsLabel={$_("editor.save_as")}
      modifyLabel={$_("editor.modify")}
      deleteLabel={$_("editor.delete")}
      {hasAiCapability}
      {hasCardImageCapability}
      isGeneratingScript={scriptGeneration.isGenerating}
      scriptStageText={getScriptGenerationStageLabel($_, scriptGeneration.stage)}
      onNewCard={handleNewCard}
      onOpenParseModal={handleOpenParseModal}
      onOpenScript={handleOpenScript}
      onGenerateScript={handleGenerateScript}
      onCancelGenerateScript={handleCancelGenerateScript}
      onOpenCardImageDrawer={openCardImageDrawer}
      onResetSearch={handleResetSearch}
      onSearch={handleSearchFromDraft}
      onSaveAs={handleSaveAs}
      onModify={handleModify}
      onDelete={handleDelete}
    />
  </div>
{/if}

{#if hasCardImageCapability && cardImageDrawerHostModulePromise}
  {#await cardImageDrawerHostModulePromise then module}
    <module.default
      open={imageInteraction.isDrawerOpen}
      card={draftCard}
      cdbPath={$activeTab?.path ?? ""}
      onSavedJpg={handleCardImageSaved}
      onClose={closeCardImageDrawer}
    />
  {/await}
{/if}

{#if hasAiCapability && cardParseDialogModulePromise}
  {#await cardParseDialogModulePromise then module}
    <module.default
      open={isParseModalOpen}
      mode={aiInteractionMode}
      bind:manuscriptInput
      isParsing={isParsingManuscript}
      onModeChange={handleAiInteractionModeChange}
      onClose={closeParseModal}
      onConfirm={handleParseManuscriptConfirm}
      onBackdropKeydown={handleParseModalBackdropKeydown}
      closeAriaLabel={$_("editor.card_image_crop_cancel")}
      dialogAriaLabel={$_("editor.ai_interaction_title")}
      title={$_("editor.ai_interaction_title")}
      description={aiInteractionMode === "parse" ? $_("editor.ai_parse_description") : $_("editor.ai_instruction_description")}
      placeholder={aiInteractionMode === "parse" ? $_("editor.ai_parse_placeholder") : $_("editor.ai_instruction_placeholder")}
      cancelLabel={$_("editor.card_image_crop_cancel")}
      confirmLabel={aiInteractionMode === "parse" ? $_("editor.ai_parse_confirm") : $_("editor.ai_instruction_confirm")}
      parsingLabel={aiInteractionMode === "parse" ? $_("editor.ai_parsing") : $_("editor.ai_instruction_running")}
      parseModeLabel={$_("editor.ai_parse_mode")}
      instructionModeLabel={$_("editor.ai_instruction_mode")}
      resultTitle={$_("editor.ai_instruction_result_title")}
      resultText={aiInteractionResult}
    />
  {/await}
{/if}

<CardImagePreview
  open={imageInteraction.isPreviewOpen}
  {imageSrc}
  closeAriaLabel="Close image preview"
  dialogAriaLabel="Card image preview"
  previewAlt="Card preview"
  onClose={closeImagePreview}
/>

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
