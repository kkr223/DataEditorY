<script lang="ts">
  import { untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import {
    activeTab,
    deleteCard,
    getCardById,
    isDbLoaded,
    modifyCard,
    saveCdbFile,
  } from "$lib/stores/db";
  import { editorState, getAllCardsMap, handleSearch } from "$lib/stores/editor.svelte";
  import { showToast } from "$lib/stores/toast.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { dirname, join } from "@tauri-apps/api/path";
  import { ask, open } from "@tauri-apps/plugin-dialog";
  import { CardDataEntry } from "ygopro-cdb-encode";
  import {
    getSetcode,
    loadPopularSetcodes,
    updateSetcode,
  } from "$lib/utils/setcode";
  import {
    ATTRIBUTE_OPTIONS,
    cloneEditableCard,
    getPackedLevel,
    getPackedLScale,
    getPackedRScale,
    LINK_MARKERS,
    PERMISSION_OPTIONS,
    RACE_OPTIONS,
    setPackedLevel,
    TYPE_BITS,
  } from "$lib/utils/card";

  function createEmptyCard(): CardDataEntry {
    return {
      code: 0,
      alias: 0,
      setcode: [0, 0, 0, 0],
      type: 0,
      attack: 0,
      defense: 0,
      level: 0,
      race: 0,
      attribute: 0,
      category: 0,
      ot: 0,
      name: "",
      desc: "",
      strings: Array.from({ length: 16 }, () => ""),
      lscale: 0,
      rscale: 0,
      linkMarker: 0,
    } as CardDataEntry;
  }

  let draftCard = $state<CardDataEntry>(createEmptyCard());
  let originalCardCode = $state<number | null>(null);
  let imageSrc = $state<string>("/cover.jpg");
  let setcodeHexes = $state<string[]>(["", "", "", ""]);
  let popularSetcodes = $state<{ value: string; label: string }[]>([]);
  let setcodesLoaded = false;
  let activeObjectUrl: string | null = null;
  let staleObjectUrl: string | null = null;
  let imageRequestToken = 0;
  let isImagePreviewOpen = $state(false);
  let imageClickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSyncedSelectedId: number | null = null;

  let isEditingExisting = $derived(originalCardCode !== null);
  let isLink = $derived((draftCard.type & 0x4000000) !== 0);
  let isPend = $derived((draftCard.type & 0x1000000) !== 0);

  function syncSetcodesFromCard(card: CardDataEntry) {
    for (let i = 0; i < 4; i++) {
      setcodeHexes[i] = getSetcode(card.setcode, i).replace(/^0x/i, "");
    }
  }

  function clearImageClickTimer() {
    if (imageClickTimer) {
      clearTimeout(imageClickTimer);
      imageClickTimer = null;
    }
  }

  function resetImageUrls() {
    clearImageClickTimer();
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }
    if (staleObjectUrl) {
      URL.revokeObjectURL(staleObjectUrl);
      staleObjectUrl = null;
    }
  }

  function resetDraftCard() {
    lastSyncedSelectedId = null;
    originalCardCode = null;
    draftCard = createEmptyCard();
    syncSetcodesFromCard(draftCard);
    imageRequestToken++;
    resetImageUrls();
    imageSrc = "/cover.jpg";
  }

  function loadCardIntoDraft(card: CardDataEntry) {
    lastSyncedSelectedId = card.code;
    originalCardCode = card.code;
    draftCard = cloneEditableCard(card);
    syncSetcodesFromCard(draftCard);
  }

  function handleImageError() {
    imageSrc = "/cover.jpg";
  }

  function handleImageLoad() {
    if (staleObjectUrl && staleObjectUrl !== activeObjectUrl) {
      URL.revokeObjectURL(staleObjectUrl);
      staleObjectUrl = null;
    }
  }

  async function getPicsDir(cdbPath: string): Promise<string> {
    const cdbDir = await dirname(cdbPath);
    return join(cdbDir, "pics");
  }

  async function resolveImageSrc(picsDir: string, code: number, bustCache = false): Promise<string> {
    const picPath = await join(picsDir, `${code}.jpg`);

    try {
      const bytes = await invoke<number[]>("read_image", { path: picPath });
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
      const objectUrl = URL.createObjectURL(blob);
      if (activeObjectUrl) {
        staleObjectUrl = activeObjectUrl;
      }
      activeObjectUrl = objectUrl;
      return bustCache ? `${objectUrl}#${Date.now()}` : objectUrl;
    } catch {
      return "/cover.jpg";
    }
  }

  async function refreshDraftImage(code: number, bustCache = false) {
    if (!$activeTab?.path || code <= 0) {
      imageRequestToken++;
      resetImageUrls();
      imageSrc = "/cover.jpg";
      return;
    }

    const requestToken = ++imageRequestToken;
    const picsDir = await getPicsDir($activeTab.path);
    const src = await resolveImageSrc(picsDir, code, bustCache);
    if (requestToken === imageRequestToken) {
      imageSrc = src;
    }
  }

  function toDbCard(card: CardDataEntry): CardDataEntry {
    const dbCard = new CardDataEntry();
    Object.assign(dbCard, card);
    dbCard.strings = [...(card.strings ?? [])];
    return dbCard;
  }

  async function saveDraftCard(targetCode: number, removeOriginal = false) {
    const nextCard = cloneEditableCard(draftCard);
    nextCard.code = targetCode;
    const dbCard = toDbCard(nextCard);

    const ok = modifyCard(dbCard);
    if (!ok) {
      showToast($_("editor.save_failed"), "error");
      return false;
    }

    if (removeOriginal && originalCardCode !== null && originalCardCode !== targetCode) {
      const deleted = deleteCard(originalCardCode);
      if (!deleted) {
        showToast($_("editor.save_failed"), "error");
        return false;
      }
    }

    draftCard = cloneEditableCard(dbCard);
    originalCardCode = targetCode;
    editorState.selectedId = targetCode;
    handleSearch(true);
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

    const existing = getCardById(targetCode);
    if (isEditingExisting && originalCardCode === targetCode) {
      await saveDraftCard(targetCode);
      return;
    }

    if (isEditingExisting && originalCardCode !== targetCode) {
      const removeOriginal = await ask($_("editor.replace_original_confirm", {
        values: { oldCode: String(originalCardCode), newCode: String(targetCode) },
      }), {
        title: $_("editor.replace_original_title"),
        kind: "warning",
      });

      if (existing && existing.code !== originalCardCode) {
        const overwriteExisting = await ask($_("editor.overwrite_target_confirm", {
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
      const overwriteExisting = await ask($_("editor.overwrite_target_confirm", {
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

    const existing = getCardById(targetCode);
    if (existing && existing.code !== originalCardCode) {
      const overwriteExisting = await ask($_("editor.overwrite_target_confirm", {
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
    const confirmed = await ask(
      $_("editor.delete_confirm", { values: { code: String(originalCardCode) } }),
      { title: $_("editor.delete_confirm_title"), kind: "warning" },
    );
    if (!confirmed) return;

    if (deleteCard(originalCardCode)) {
      showToast($_("editor.card_deleted", { values: { code: String(originalCardCode) } }), "success");
      editorState.selectedId = null;
      handleSearch();
      resetDraftCard();
    }
  }

  function handleNewCard() {
    editorState.selectedId = null;
    resetDraftCard();
  }

  async function handleImagePick() {
    if (!$activeTab?.path) return;
    const targetCode = Number(draftCard.code ?? 0);
    if (!Number.isInteger(targetCode) || targetCode <= 0) {
      showToast($_("editor.code_required"), "error");
      return;
    }

    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "png", "jpeg"] }],
    });
    if (selected && typeof selected === "string") {
      try {
        const picsDir = await getPicsDir($activeTab.path);
        const picPath = await join(picsDir, `${targetCode}.jpg`);
        await invoke("copy_image", { src: selected, dest: picPath });
        imageSrc = await resolveImageSrc(picsDir, targetCode, true);
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
    if (setcodesLoaded) return;
    setcodesLoaded = true;
    loadPopularSetcodes().then((options) => {
      popularSetcodes = options;
    });
  });

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
      if (lastSyncedSelectedId !== card.code) {
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
    return () => {
      resetImageUrls();
    };
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
                  onload={handleImageLoad}
                  onerror={handleImageError}
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
                onchange={(e) => {
                  const t = e.target as HTMLSelectElement;
                  draftCard.level = setPackedLevel(
                    parseInt(t.value),
                    getPackedLScale(draftCard.level),
                    getPackedRScale(draftCard.level),
                  );
                }}
              >
                {#each Array.from({ length: 13 }, (_, i) => i) as lvl}
                  <option value={lvl} selected={getPackedLevel(draftCard.level) === lvl}>{lvl}</option>
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
            {#each Array.from({ length: 4 }, (_, i) => i) as idx}
              {@const hexString = setcodeHexes[idx] ? "0x" + setcodeHexes[idx].padStart(4, "0").toUpperCase() : ""}
              {@const matchedOpt = hexString !== "" ? popularSetcodes.find((o) => o.value.toLowerCase() === hexString.toLowerCase()) : null}
              {@const dropdownValue = hexString === "" ? "" : matchedOpt ? matchedOpt.value : "__custom__"}
              <div class="setcode-row">
                <select
                  value={dropdownValue}
                  onchange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val === "") {
                      setcodeHexes[idx] = "";
                      draftCard.setcode = updateSetcode(draftCard.setcode, idx, "");
                    } else if (val !== "__custom__") {
                      setcodeHexes[idx] = val.replace(/^0x/i, "");
                      draftCard.setcode = updateSetcode(draftCard.setcode, idx, val);
                    }
                  }}
                >
                  <option value="">—</option>
                  {#each popularSetcodes as opt}
                    <option value={opt.value} selected={dropdownValue === opt.value}>{opt.label}</option>
                  {/each}
                  {#if dropdownValue === "__custom__"}
                    <option value="__custom__" selected>{$_("editor.custom")} ({hexString})</option>
                  {/if}
                </select>
                <div class="hex-input">
                  <span class="hex-prefix">0x</span>
                  <input
                    type="text"
                    bind:value={setcodeHexes[idx]}
                    oninput={() => {
                      draftCard.setcode = updateSetcode(
                        draftCard.setcode,
                        idx,
                        setcodeHexes[idx] ? "0x" + setcodeHexes[idx] : "",
                      );
                    }}
                    maxlength="4"
                    placeholder="0000"
                  />
                </div>
              </div>
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
                <input type="number" id="edit-lscale" min="0" max="13" disabled={!isPend} bind:value={draftCard.lscale} />
              </div>
              <div class="fg">
                <label for="edit-rscale">{$_("editor.scale_right")}</label>
                <input type="number" id="edit-rscale" min="0" max="13" disabled={!isPend} bind:value={draftCard.rscale} />
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
      <button class="btn-secondary btn-sm" onclick={handleNewCard}>{$_("editor.new_card")}</button>
      <div class="btn-group">
        <button class="btn-secondary btn-sm" onclick={handleSaveAs}>{$_("editor.save_as")}</button>
        <button class="btn-primary btn-sm" onclick={handleModify}>{$_("editor.modify")}</button>
        <button class="btn-danger btn-sm" onclick={handleDelete} disabled={!isEditingExisting}>{$_("editor.delete")}</button>
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
  .setcode-row {
    display: flex;
    gap: 4px;
  }
  .setcode-row select {
    flex: 2;
    padding: 2px 4px;
    font-size: 0.84rem;
  }
  .hex-input {
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }
  .hex-input:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }
  .hex-prefix {
    padding: 0 4px;
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-family: monospace;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-color);
    height: 100%;
    display: flex;
    align-items: center;
  }
  .hex-input input {
    border: none;
    border-radius: 0;
    padding: 2px 4px;
    font-family: monospace;
    font-size: 0.88rem;
  }
  .hex-input input:focus {
    box-shadow: none;
    outline: none;
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
