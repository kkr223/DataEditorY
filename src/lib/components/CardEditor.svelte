<script lang="ts">
  import { onMount, tick } from "svelte";
  import { untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    activeTab,
    activeTabId,
    deleteCard,
    getCardById,
    isDbLoaded,
    modifyCard,
    saveCdbFile,
  } from "$lib/stores/db";
  import { clearSelection, editorState, getAllCardsMap, handleSearch, setSingleSelectedCard, updateVisibleCards } from "$lib/stores/editor.svelte";
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
    ATTRIBUTE_OPTIONS,
    cloneEditableCard,
    createEmptyCard,
    getPackedLevel,
    LINK_MARKERS,
    PERMISSION_OPTIONS,
    RACE_OPTIONS,
    setPackedLevel,
    TYPE_BITS,
  } from "$lib/utils/card";
  import { createCardSnapshot, toPersistableCard } from "$lib/domain/card/draft";
  import { APP_SHORTCUT_EVENT } from "$lib/utils/shortcuts";
  import { HAS_AI_FEATURE, HAS_CARD_IMAGE_FEATURE } from "$lib/config/build";
  import { appSettingsState } from "$lib/stores/appSettings.svelte";
  import { writeErrorLog } from "$lib/utils/errorLog";
  import type { AgentStage } from "$lib/utils/ai";
  import { parseCardManuscript } from "$lib/utils/ai";
  import { createAiAppContext } from "$lib/services/aiAppContext";
  import { generateCardScriptFile, getScriptGenerationStageLabel, ensureAiReady, ensureScriptOverwriteConfirmed, isAbortError } from "$lib/services/scriptGeneration";
  import { openCardScriptWorkspace } from "$lib/services/cardScriptService";
  import { importCardImage, resolveCardImageSrc } from "$lib/services/cardImageService";
  import SetcodeField from "$lib/components/SetcodeField.svelte";

  type CardImageDrawerModule = typeof import("$lib/components/CardImageDrawer.svelte");

  const SETCODE_SLOT_INDICES = [0, 1, 2, 3] as const;


  let draftCard = $state<CardDataEntry>(createEmptyCard());
  let originalCardCode = $state<number | null>(null);
  let imageSrc = $state<string>("/resources/cover.jpg");
  let setcodeHexes = $state<string[]>(["", "", "", ""]);
  let popularSetcodes = $state<{ value: string; label: string }[]>([]);
  let imageRequestToken = 0;
  let isImagePreviewOpen = $state(false);
  let imageClickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSyncedSelectedId: number | null = null;
  let lastLoadedCardSnapshot = $state("");
  let isCardImageDrawerOpen = $state(false);
  let cardImageDrawerModulePromise = $state<Promise<CardImageDrawerModule> | null>(null);
  let lastDefaultCoverSrc = $state("/resources/cover.jpg");
  let isParseModalOpen = $state(false);
  let manuscriptInput = $state("");
  let isParsingManuscript = $state(false);
  let isGeneratingScript = $state(false);
  let scriptGenerationStage = $state<AgentStage | "">("");
  let scriptGenerationAbortController = $state<AbortController | null>(null);

  let isEditingExisting = $derived(originalCardCode !== null);
  let isLink = $derived((draftCard.type & 0x4000000) !== 0);
  let isPend = $derived((draftCard.type & 0x1000000) !== 0);
  let popularSetcodeValues = $derived.by(() => new Set(popularSetcodes.map((option) => option.value)));

  function getDefaultCoverSrc() {
    return appSettingsState.coverImageSrc || "/resources/cover.jpg";
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
    const safeScale = Math.max(0, Math.min(13, Number.isFinite(nextScale) ? nextScale : 0));
    if (side === "left") {
      draftCard.lscale = safeScale;
    } else {
      draftCard.rscale = safeScale;
    }

    draftCard.level = setPackedLevel(
      getPackedLevel(draftCard.level),
      draftCard.lscale,
      draftCard.rscale,
    );
  }

  function clearImageClickTimer() {
    if (imageClickTimer) {
      clearTimeout(imageClickTimer);
      imageClickTimer = null;
    }
  }

  function resetDraftCard() {
    lastSyncedSelectedId = null;
    lastLoadedCardSnapshot = "";
    originalCardCode = null;
    draftCard = createEmptyCard();
    syncSetcodesFromCard(draftCard);
    imageRequestToken++;
    clearImageClickTimer();
    imageSrc = getDefaultCoverSrc();
  }

  function loadCardIntoDraft(card: CardDataEntry) {
    lastSyncedSelectedId = card.code;
    lastLoadedCardSnapshot = createCardSnapshot(card);
    originalCardCode = card.code;
    draftCard = cloneEditableCard(card);
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
      clearImageClickTimer();
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
    const nextCard = cloneEditableCard(draftCard);
    nextCard.code = targetCode;
    const dbCard = toPersistableCard(nextCard);

    const ok = await modifyCard(dbCard);
    if (!ok) {
      showToast($_("editor.save_failed"), "error");
      return false;
    }

    if (removeOriginal && originalCardCode !== null && originalCardCode !== targetCode) {
      const deleted = await deleteCard(originalCardCode);
      if (!deleted) {
        showToast($_("editor.save_failed"), "error");
        return false;
      }
    }

    draftCard = cloneEditableCard(dbCard);
    lastSyncedSelectedId = targetCode;
    lastLoadedCardSnapshot = createCardSnapshot(dbCard);
    updateVisibleCards([dbCard]);
    originalCardCode = targetCode;
    setSingleSelectedCard(targetCode);
    await handleSearch(true);
    await refreshDraftImage(targetCode, true);
    showToast($_("editor.card_modified", { values: { code: String(targetCode) } }), "success");
    return true;
  }

  async function handleModify() {
    if (!$isDbLoaded) return;

    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) {
      showToast($_("editor.code_required"), "error");
      return;
    }

    const existing = await getCardById(targetCode);
    if (isEditingExisting && originalCardCode === targetCode) {
      await saveDraftCard(targetCode);
      return;
    }

    if (isEditingExisting && originalCardCode !== targetCode) {
      const removeOriginal = await tauriBridge.ask($_("editor.replace_original_confirm", {
        values: { oldCode: String(originalCardCode), newCode: String(targetCode) },
      }), {
        title: $_("editor.replace_original_title"),
        kind: "warning",
      });

      if (existing && existing.code !== originalCardCode) {
        const overwriteExisting = await tauriBridge.ask($_("editor.overwrite_target_confirm", {
          values: { code: String(targetCode) },
        }), {
          title: $_("editor.overwrite_target_title"),
          kind: "warning",
        });
        if (!overwriteExisting) return;
      }

      await saveDraftCard(targetCode, !!removeOriginal);
      return;
    }

    if (existing) {
      const overwriteExisting = await tauriBridge.ask($_("editor.overwrite_target_confirm", {
        values: { code: String(targetCode) },
      }), {
        title: $_("editor.overwrite_target_title"),
        kind: "warning",
      });
      if (!overwriteExisting) return;
    }

    await saveDraftCard(targetCode);
  }

  async function handleSaveAs() {
    if (!$isDbLoaded) return;

    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) {
      showToast($_("editor.code_required"), "error");
      return;
    }

    const existing = await getCardById(targetCode);
    if (existing && existing.code !== originalCardCode) {
      const overwriteExisting = await tauriBridge.ask($_("editor.overwrite_target_confirm", {
        values: { code: String(targetCode) },
      }), {
        title: $_("editor.overwrite_target_title"),
        kind: "warning",
      });
      if (!overwriteExisting) return;
    }

    await saveDraftCard(targetCode, false);
  }

  async function handleDelete() {
    if (!$isDbLoaded || originalCardCode === null) return;
    const confirmed = await tauriBridge.ask(
      $_("editor.delete_confirm", { values: { code: String(originalCardCode) } }),
      { title: $_("editor.delete_confirm_title"), kind: "warning" },
    );
    if (!confirmed) return;

    if (await deleteCard(originalCardCode)) {
      showToast($_("editor.card_deleted", { values: { code: String(originalCardCode) } }), "success");
      clearSelection();
      await handleSearch();
      resetDraftCard();
    }
  }

  function handleNewCard() {
    clearSelection();
    resetDraftCard();
  }

  onMount(() => {
    loadPopularSetcodes().then((options) => {
      popularSetcodes = options;
    });

    const handleShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== "new-card" || !$isDbLoaded) return;

      handleNewCard();
    };

    window.addEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
    return () => {
      scriptGenerationAbortController?.abort();
      window.removeEventListener(APP_SHORTCUT_EVENT, handleShortcut as EventListener);
    };
  });

  async function handleImagePick() {
    if (!$activeTab?.path) return;
    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) {
      showToast($_("editor.code_required"), "error");
      return;
    }

    const selected = await tauriBridge.open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "png", "jpeg"] }],
    });
    if (selected && typeof selected === "string") {
      try {
        await importCardImage({
          cdbPath: $activeTab.path,
          cardCode: targetCode,
          sourcePath: selected,
        });
        imageSrc = await resolveCardImageSrc($activeTab.path, targetCode, true);
      } catch (error) {
        console.error("Failed to copy image", error);
      }
    }
  }

  function handleImageClick() {
    clearImageClickTimer();
    imageClickTimer = setTimeout(() => {
      imageClickTimer = null;
      void handleImagePick();
    }, 220);
  }

  function handleImageDoubleClick(event: MouseEvent) {
    event.preventDefault();
    clearImageClickTimer();
    if (!imageSrc) return;
    isImagePreviewOpen = true;
  }

  function closeImagePreview() {
    isImagePreviewOpen = false;
  }

  function openCardImageDrawer() {
    if (!HAS_CARD_IMAGE_FEATURE) return;
    cardImageDrawerModulePromise ??= import("$lib/components/CardImageDrawer.svelte");
    isCardImageDrawerOpen = true;
  }

  function closeCardImageDrawer() {
    isCardImageDrawerOpen = false;
  }

  async function handleCardImageSaved() {
    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) return;
    await refreshDraftImage(targetCode, true);
  }

  function getCurrentCardCode() {
    const code = Number(draftCard.code ?? 0);
    if (!Number.isInteger(code) || code <= 0) {
      showToast($_("editor.code_required"), "error");
      return null;
    }

    return code;
  }

  async function handleOpenScript() {
    if (!$activeTab?.path) return;

    const code = getCurrentCardCode();
    if (!code) return;

    try {
      const context = createAiAppContext();
      const existingInfo = await context.readCardScript(code, $activeTab.path);

      if (!existingInfo.exists) {
        const shouldCreate = await tauriBridge.ask($_("editor.script_create_confirm", {
          values: { code: String(code) },
        }), {
          title: $_("editor.script_create_title"),
          kind: "warning",
        });

        if (!shouldCreate) return;

      }

      const opened = await openCardScriptWorkspace({
        cdbPath: $activeTab.path,
        sourceTabId: $activeTabId,
        cardCode: code,
        cardName: draftCard.name ?? "",
      });

      if (opened.createdFromTemplate) {
        showToast($_("editor.script_created", { values: { code: String(code) } }), "success");
      }
    } catch (error) {
      console.error("Failed to open script", error);
      void writeErrorLog({
        source: "editor.script.open",
        error,
        extra: { cdbPath: $activeTab?.path ?? "", cardCode: code },
      });
      showToast($_("editor.script_open_failed"), "error");
    }
  }

  async function handleGenerateScript() {
    if (!$activeTab?.path) return;
    if (!(await ensureAiReady())) return;

    const code = getCurrentCardCode();
    if (!code) return;

    const cardForScript = toPersistableCard(cloneEditableCard(draftCard));

    try {
      const shouldOverwrite = await ensureScriptOverwriteConfirmed($activeTab.path, code);
      if (!shouldOverwrite) return;

      isGeneratingScript = true;
      scriptGenerationStage = "collecting_references";
      const abortController = new AbortController();
      scriptGenerationAbortController = abortController;
      await generateCardScriptFile({
        cdbPath: $activeTab.path,
        sourceTabId: $activeTabId,
        card: cardForScript,
        signal: abortController.signal,
        onStageChange: (stage) => {
          scriptGenerationStage = stage;
        },
      });
      showToast($_("editor.script_generated", { values: { code: String(code) } }), "success");
    } catch (error) {
      if (isAbortError(error)) {
        showToast($_("editor.script_generation_canceled"), "info");
        return;
      }
      console.error("Failed to generate script", error);
      void writeErrorLog({
        source: "editor.script.generate",
        error,
        extra: { cdbPath: $activeTab?.path ?? "", cardCode: code, cardName: cardForScript.name ?? "" },
      });
      showToast($_("editor.script_generate_failed"), "error");
    } finally {
      isGeneratingScript = false;
      scriptGenerationStage = "";
      scriptGenerationAbortController = null;
    }
  }

  function handleCancelGenerateScript() {
    scriptGenerationAbortController?.abort();
  }

  async function saveParsedCardsIndividually(cards: CardDataEntry[]) {
    const validCards = cards.filter((card) => Number.isInteger(Number(card.code ?? 0)) && Number(card.code ?? 0) > 0);
    if (validCards.length === 0) {
      showToast($_("editor.code_required"), "error");
      return false;
    }

    const existingCards = await Promise.all(validCards.map((card) => getCardById(Number(card.code))));
    const conflicts = existingCards.filter((card) => card !== undefined);
    if (conflicts.length > 0) {
      const shouldOverwrite = await tauriBridge.ask($_("editor.ai_parse_multi_overwrite_confirm", {
        values: { count: String(conflicts.length) },
      }), {
        title: $_("editor.ai_parse_multi_overwrite_title"),
        kind: "warning",
      });
      if (!shouldOverwrite) return false;
    }

    let savedCount = 0;
    let lastSavedCard: CardDataEntry | null = null;
    for (const card of validCards) {
      const ok = await modifyCard(toPersistableCard(card));
      if (!ok) {
        showToast($_("editor.save_failed"), "error");
        return false;
      }
      savedCount += 1;
      lastSavedCard = cloneEditableCard(card);
    }

    if (!lastSavedCard) {
      return false;
    }

    loadCardIntoDraft(lastSavedCard);
    setSingleSelectedCard(lastSavedCard.code);
    await handleSearch(true);
    await refreshDraftImage(lastSavedCard.code, true);
    showToast($_("editor.ai_parse_multi_saved", { values: { count: String(savedCount) } }), "success");
    return true;
  }

  async function handleOpenParseModal() {
    if (!HAS_AI_FEATURE) return;
    if (!(await ensureAiReady())) return;

    manuscriptInput = draftCard.name || draftCard.desc
      ? `${draftCard.name ?? ""}\n${draftCard.desc ?? ""}`.trim()
      : "";
    isParseModalOpen = true;
  }

  function closeParseModal() {
    if (isParsingManuscript) return;
    isParseModalOpen = false;
  }

  function handleParseModalBackdropKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      closeParseModal();
    }
  }

  async function handleParseManuscriptConfirm() {
    if (!HAS_AI_FEATURE) return;

    if (!manuscriptInput.trim()) {
      showToast($_("editor.ai_parse_empty"), "info");
      return;
    }

    try {
      isParsingManuscript = true;
      const result = await parseCardManuscript(manuscriptInput, draftCard, createAiAppContext());
      if (result.cards.length === 0) {
        showToast($_("editor.ai_parse_failed"), "error");
        return;
      }

      if (result.cards.length === 1) {
        draftCard = result.cards[0];
        syncSetcodesFromCard(draftCard);
        await tick();

        const targetCode = Number(draftCard.code ?? 0);
        if (Number.isInteger(targetCode) && targetCode > 0) {
          await handleModify();
        } else {
          showToast($_("editor.ai_parse_applied_draft"), "success");
        }
      } else {
        const saved = await saveParsedCardsIndividually(result.cards);
        if (!saved) return;
      }

      isParseModalOpen = false;
    } catch (error) {
      console.error("Failed to parse manuscript", error);
      void writeErrorLog({
        source: "editor.ai.parse-manuscript",
        error,
        extra: {
          cdbPath: $activeTab?.path ?? "",
          currentCardCode: draftCard.code ?? 0,
          manuscriptPreview: manuscriptInput.slice(0, 500),
        },
      });
      showToast($_("editor.ai_parse_failed"), "error");
    } finally {
      isParsingManuscript = false;
    }
  }

  function handlePreviewKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeImagePreview();
    }
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
</script>

{#if $isDbLoaded}
  <div class="editor-area">
    <div class="editor-header">
      <h2>{$_("editor.title")}</h2>
      <button class="btn-primary btn-sm" onclick={handleSave}>{$_("editor.save_db")}</button>
    </div>

    <div class="top-strip">
      <div class="strip-field" style="width:120px">
        <label for="edit-id">{$_("editor.id")}</label>
        <input type="number" id="edit-id" bind:value={draftCard.code} />
      </div>
      <div class="strip-field" style="width:90px">
        <label for="edit-alias">{$_("editor.alias")}</label>
        <input type="number" id="edit-alias" bind:value={draftCard.alias} />
      </div>
      <div class="strip-field" style="flex:1">
        <label for="edit-name">{$_("editor.name")}</label>
        <input type="text" id="edit-name" bind:value={draftCard.name} />
      </div>
      <button class="btn-secondary btn-sm top-action" onclick={handleNewCard}>{$_("editor.new_card")}</button>
    </div>

    <div class="editor-columns">
      <div class="editor-col">
        <div class="card-top-row">
          <button
            class="image-picker"
            onclick={handleImageClick}
            ondblclick={handleImageDoubleClick}
            aria-label="Single click to select image, double click to preview"
            title="单击更换图片，双击放大预览"
          >
            {#if imageSrc}
              {#key imageSrc}
                <img
                  src={imageSrc}
                  alt="Card"
                  class="card-img"
                  onerror={() => handleImageError(imageSrc)}
                />
              {/key}
            {:else}
              <div class="no-img">📷</div>
            {/if}
          </button>
          <div class="stats-beside-img">
            <div class="inline-field">
              <label for="edit-ot">{$_("editor.license")}</label>
              <select id="edit-ot" bind:value={draftCard.ot}>
                {#each PERMISSION_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-attribute">{$_("editor.attribute")}</label>
              <select id="edit-attribute" bind:value={draftCard.attribute}>
                {#each ATTRIBUTE_OPTIONS as opt}
                  <option value={opt.value}>{opt.key ? $_(opt.key) : opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-race">{$_("editor.race")}</label>
              <select id="edit-race" bind:value={draftCard.race}>
                {#each RACE_OPTIONS as r}
                  <option value={r.value}>{$_(r.key!)}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-level">{$_("editor.level")}</label>
              <select
                id="edit-level"
                value={getPackedLevel(draftCard.level)}
                onchange={(e) => {
                  const t = e.target as HTMLSelectElement;
                  updateDraftLevel(parseInt(t.value, 10));
                }}
              >
                {#each Array.from({ length: 13 }, (_, i) => i + 1) as lvl}
                  <option value={lvl}>{lvl}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-atk">{$_("editor.atk")}</label>
              <input type="number" id="edit-atk" bind:value={draftCard.attack} />
            </div>
            <div class="inline-field">
              <label for="edit-def">{$_("editor.def")}</label>
              <input type="number" id="edit-def" bind:value={draftCard.defense} />
            </div>
          </div>
        </div>

        <div class="fg">
          <span class="group-label">{$_("editor.types")}</span>
          <div class="checkbox-grid">
            {#each TYPE_BITS as tb}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={(draftCard.type & tb.bit) !== 0}
                  onchange={(e) => {
                    const t = e.target as HTMLInputElement;
                    if (t.checked) draftCard.type |= tb.bit;
                    else draftCard.type &= ~tb.bit;
                  }}
                />
                {$_(tb.key)}
              </label>
            {/each}
          </div>
        </div>

        <div class="fg flex-1-min">
          <label for="edit-desc">{$_("editor.desc")}</label>
          <textarea id="edit-desc" bind:value={draftCard.desc}></textarea>
        </div>
      </div>

      <div class="editor-col">
        <div class="fg">
          <span class="group-label">{$_("editor.setcodes")}</span>
          <div class="setcode-grid">
            {#each SETCODE_SLOT_INDICES as idx (idx)}
              <SetcodeField
                index={idx}
                hexValue={setcodeHexes[idx]}
                options={popularSetcodes}
                knownValues={popularSetcodeValues}
                customLabel={$_("editor.custom")}
                onSelectChange={handleSetcodeSelectChange}
                onHexChange={handleSetcodeHexChange}
              />
            {/each}
          </div>
        </div>

        <div class="row-2 align-start">
          <div class="fg" class:disabled-opacity={!isLink}>
            <span class="group-label">{$_("editor.link_markers")}</span>
            <div class="link-marker-grid">
              {#each LINK_MARKERS as lm}
                <button
                  class="link-arrow"
                  class:active={isLink && (draftCard.linkMarker & lm.bit) !== 0}
                  disabled={!isLink}
                  style="grid-row:{lm.row + 1};grid-column:{lm.col + 1}"
                  onclick={() => (draftCard.linkMarker ^= lm.bit)}
                >{lm.label}</button>
              {/each}
              <div class="link-center" style="grid-row:2;grid-column:2">⬡</div>
            </div>
          </div>

          <div class="fg flex-1" class:disabled-opacity={!isPend}>
            <span class="group-label">{$_("editor.scale")}</span>
            <div class="row-2">
              <div class="fg">
                <label for="edit-lscale">{$_("editor.scale_left")}</label>
                <input
                  type="number"
                  id="edit-lscale"
                  min="0"
                  max="13"
                  disabled={!isPend}
                  value={draftCard.lscale}
                  oninput={(event) => updateDraftScale("left", Number((event.currentTarget as HTMLInputElement).value))}
                />
              </div>
              <div class="fg">
                <label for="edit-rscale">{$_("editor.scale_right")}</label>
                <input
                  type="number"
                  id="edit-rscale"
                  min="0"
                  max="13"
                  disabled={!isPend}
                  value={draftCard.rscale}
                  oninput={(event) => updateDraftScale("right", Number((event.currentTarget as HTMLInputElement).value))}
                />
              </div>
            </div>
          </div>
        </div>

        <div class="fg" style="flex:1; min-height:0;">
          <span class="group-label">{$_("editor.hints")}</span>
          <div class="hints-container">
            {#each Array.from({ length: 16 }, (_, i) => i) as idx}
              <div class="hint-row">
                <span class="hint-label">str{idx + 1}</span>
                <input type="text" bind:value={draftCard.strings[idx]} />
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <div class="editor-empty-hint">
      {#if isEditingExisting}
        {$_("editor.editing_card", { values: { code: String(originalCardCode) } })}
      {:else}
        {$_("editor.new_card_hint")}
      {/if}
    </div>

    <div class="editor-bottom">
      <div class="editor-bottom-left">
        <button class="btn-secondary btn-sm" onclick={handleNewCard}>{$_("editor.new_card")}</button>
        {#if HAS_AI_FEATURE}
          <button class="btn-secondary btn-sm" onclick={handleOpenParseModal}>{$_("editor.ai_parse_button")}</button>
        {/if}
        <button class="btn-secondary btn-sm" onclick={handleOpenScript}>{$_("editor.script_button")}</button>
        {#if HAS_AI_FEATURE}
          <div class="script-generate-group">
            <button class="btn-secondary btn-sm" onclick={handleGenerateScript} disabled={isGeneratingScript}>
              {isGeneratingScript ? $_("editor.script_generating") : $_("editor.script_generate_button")}
            </button>
            {#if isGeneratingScript}
              <button class="btn-secondary btn-sm" type="button" onclick={handleCancelGenerateScript}>
                {$_("editor.script_cancel_button")}
              </button>
              <span class="script-stage-text">{getScriptGenerationStageLabel(scriptGenerationStage)}</span>
            {/if}
          </div>
        {/if}
        {#if HAS_CARD_IMAGE_FEATURE}
          <button class="btn-secondary btn-sm" onclick={openCardImageDrawer}>{$_("editor.card_image_button")}</button>
        {/if}
      </div>
      <div class="btn-group">
        <button class="btn-secondary btn-sm" onclick={handleSaveAs}>{$_("editor.save_as")}</button>
        <button class="btn-primary btn-sm" onclick={handleModify}>{$_("editor.modify")}</button>
        <button class="btn-danger btn-sm" onclick={handleDelete} disabled={!isEditingExisting}>{$_("editor.delete")}</button>
      </div>
    </div>
  </div>
{/if}

{#if HAS_CARD_IMAGE_FEATURE}
  {#if isCardImageDrawerOpen && cardImageDrawerModulePromise}
    {#await cardImageDrawerModulePromise then module}
      <module.default
        open={isCardImageDrawerOpen}
        card={draftCard}
        cdbPath={$activeTab?.path ?? ""}
        onSavedJpg={handleCardImageSaved}
        onClose={closeCardImageDrawer}
      />
    {/await}
  {/if}
{/if}

{#if HAS_AI_FEATURE && isParseModalOpen}
  <div
    class="ai-modal-backdrop"
    role="button"
    tabindex="0"
    aria-label={$_("editor.card_image_crop_cancel")}
    onclick={closeParseModal}
    onkeydown={handleParseModalBackdropKeydown}
  >
    <div
      class="ai-modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={$_("editor.ai_parse_title")}
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <div class="ai-modal-header">
        <div>
          <h3>{$_("editor.ai_parse_title")}</h3>
          <p>{$_("editor.ai_parse_description")}</p>
        </div>
        <button class="close-dialog-btn" type="button" onclick={closeParseModal}>×</button>
      </div>
      <textarea
        class="ai-modal-textarea"
        bind:value={manuscriptInput}
        placeholder={$_("editor.ai_parse_placeholder")}
      ></textarea>
      <div class="ai-modal-actions">
        <button class="btn-secondary btn-sm" type="button" onclick={closeParseModal} disabled={isParsingManuscript}>
          {$_("editor.card_image_crop_cancel")}
        </button>
        <button class="btn-primary btn-sm" type="button" onclick={handleParseManuscriptConfirm} disabled={isParsingManuscript}>
          {isParsingManuscript ? $_("editor.ai_parsing") : $_("editor.ai_parse_confirm")}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if isImagePreviewOpen}
  <div
    class="image-preview-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close image preview"
    onclick={closeImagePreview}
    onkeydown={handlePreviewKeydown}
  >
    <div
      class="image-preview-dialog"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Card image preview"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <img src={imageSrc} alt="Card preview" class="image-preview-img" />
    </div>
  </div>
{/if}

<style>
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    min-width: 0;
    overflow: hidden;
  }
  .editor-empty-hint {
    padding: 0 10px 8px;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }
  .editor-header {
    height: 2.5rem;
    min-height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-color);
  }
  .editor-header h2 {
    font-size: 1rem;
    font-weight: 600;
  }
  .top-strip {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-base);
    align-items: end;
  }
  .top-action {
    height: fit-content;
  }
  .strip-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .strip-field label {
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-weight: 600;
  }
  .strip-field input {
    padding: 0.25rem 0.45rem;
    font-size: 0.9rem;
  }
  .editor-columns {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .editor-col {
    flex: 1;
    padding: 8px 10px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }
  .editor-col:first-child {
    border-right: 1px solid var(--border-color);
  }
  .card-top-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  .image-picker {
    width: clamp(130px, 10vw, 190px);
    min-width: 130px;
    aspect-ratio: 0.69;
    background: var(--bg-base);
    border: 1px dashed var(--border-color);
    border-radius: 4px;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    transition: border-color 0.2s;
    align-self: flex-start;
  }
  .image-picker:hover {
    border-color: var(--accent-primary);
  }
  .image-picker:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .card-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .no-img {
    font-size: 1.5rem;
    opacity: 0.3;
  }
  .stats-beside-img {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    justify-content: flex-start;
  }
  .fg {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-bottom: 6px;
  }
  .row-2 {
    display: flex;
    gap: 6px;
  }
  .row-2 .fg {
    flex: 1;
    margin-bottom: 0;
  }
  .align-start {
    align-items: flex-start;
  }
  .flex-1 {
    flex: 1;
  }
  .inline-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 1px 0;
  }
  .inline-field label {
    min-width: 60px;
    font-size: 0.82rem;
    color: var(--text-secondary);
    text-align: left;
    margin: 0;
  }
  .inline-field input,
  .inline-field select {
    flex: 1;
    width: 100%;
    min-width: 0;
    margin: 0;
  }
  .flex-1-min {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 3px;
  }
  .flex-1-min textarea {
    flex: 1;
    min-height: 120px;
    resize: none;
  }
  label,
  .group-label {
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-weight: 600;
  }
  input,
  select,
  textarea {
    width: 100%;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 0.9rem;
    transition: border-color 0.15s;
  }
  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
    outline: none;
  }
  textarea {
    font-size: 0.94rem;
    padding: 6px;
  }
  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1px 4px;
    background: var(--bg-base);
    padding: 4px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    user-select: none;
    font-size: 0.82rem;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .checkbox-label input {
    width: auto;
    accent-color: var(--accent-primary);
    margin: 0;
  }
  .setcode-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: var(--bg-base);
    padding: 6px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }
  .link-marker-grid {
    display: grid;
    grid-template-columns: 28px 28px 28px;
    grid-template-rows: 28px 28px 28px;
    gap: 3px;
    justify-content: start;
  }
  .link-arrow {
    width: 28px;
    height: 28px;
    font-size: 0.9rem;
    padding: 0 !important;
    border: 1px solid var(--border-color);
    background: var(--bg-base);
    color: var(--text-secondary);
    border-radius: 4px;
    transition: all 0.15s;
  }
  .link-arrow.active {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
    box-shadow: 0 0 4px rgba(59, 130, 246, 0.4);
  }
  .link-arrow:hover {
    background: var(--bg-surface-hover);
  }
  .link-arrow.active:hover {
    background: var(--accent-primary-hover);
  }
  .link-center {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    color: var(--text-secondary);
    opacity: 0.25;
  }
  .disabled-opacity {
    opacity: 0.5;
    pointer-events: none;
  }
  .disabled-opacity input,
  .disabled-opacity button {
    cursor: not-allowed;
  }
  .link-arrow:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .link-arrow:disabled:hover {
    background: var(--bg-base);
  }
  .hints-container {
    flex: 1;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-base);
  }
  .hint-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    border-bottom: 1px solid var(--border-color);
  }
  .hint-row:last-child {
    border-bottom: none;
  }
  .hint-label {
    font-size: 0.76rem;
    color: var(--text-secondary);
    min-width: 26px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .hint-row input {
    border: none;
    background: transparent;
    padding: 2px 0;
    font-size: 0.86rem;
  }
  .hint-row input:focus {
    box-shadow: none;
  }
  .editor-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    border-top: 1px solid var(--border-color);
    flex-shrink: 0;
  }
  .editor-bottom-left {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .script-generate-group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .script-stage-text {
    font-size: 0.8rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .btn-group {
    display: flex;
    gap: 6px;
  }
  button {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.15s;
    cursor: pointer;
    border: none;
  }
  .btn-sm {
    padding: 0.25rem 0.6rem;
    font-size: 0.84rem;
  }
  .btn-primary {
    background: var(--accent-primary);
    color: white;
  }
  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }
  .btn-secondary {
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }
  .btn-secondary:hover {
    background: var(--bg-surface-hover);
  }
  .btn-danger {
    background: #dc2626;
    color: white;
  }
  .btn-danger:hover {
    background: #b91c1c;
  }
  .image-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(5, 10, 18, 0.82);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .image-preview-dialog {
    max-width: min(92vw, 900px);
    max-height: 92vh;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
  }
  .image-preview-img {
    display: block;
    width: 100%;
    max-width: min(92vw, 900px);
    max-height: 92vh;
    object-fit: contain;
    background: #000;
  }
  .ai-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1100;
    background: rgba(5, 10, 18, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .ai-modal {
    width: min(860px, 94vw);
    min-height: 420px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 14px;
    box-shadow: 0 22px 60px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
  }
  .ai-modal-header,
  .ai-modal-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .ai-modal-header h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1rem;
  }
  .ai-modal-header p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 0.86rem;
  }
  .close-dialog-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 999px;
    background: var(--bg-surface-active);
    color: var(--text-primary);
  }
  .ai-modal-textarea {
    flex: 1;
    min-height: 280px;
    resize: vertical;
    font-size: 0.95rem;
    line-height: 1.5;
  }
  @media (min-width: 2560px) {
    .editor-col {
      padding: 0.7rem 0.9rem;
    }
    .link-marker-grid {
      grid-template-columns: 32px 32px 32px;
      grid-template-rows: 32px 32px 32px;
    }
    .link-arrow {
      width: 32px;
      height: 32px;
      font-size: 1rem;
    }
  }
</style>
