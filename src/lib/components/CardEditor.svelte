<script lang="ts">
  import { _ } from "svelte-i18n";
  import {
    isDbLoaded,
    saveCdbFile,
    modifyCard,
    deleteCard,
    activeTab,
  } from "$lib/stores/db";
  import {
    editorState,
    getAllCardsMap,
    handleSearch,
  } from "$lib/stores/editor.svelte";
  import {
    getSetcode,
    updateSetcode,
    loadPopularSetcodes,
  } from "$lib/utils/setcode";
  import { invoke, convertFileSrc } from "@tauri-apps/api/core";
  import { open, ask } from "@tauri-apps/plugin-dialog";
  import { exists } from "@tauri-apps/plugin-fs";
  import { showToast } from "$lib/stores/toast.svelte";
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
  } from '$lib/utils/card';

  import { CardDataEntry } from "ygopro-cdb-encode";

  let selectedCard = $state<CardDataEntry | null>(null);
  let imageSrc = $state<string>("/cover.jpg");
  let setcodeHexes = $state<string[]>(["", "", "", ""]);
  let popularSetcodes = $state<{ value: string; label: string }[]>([]);
  let setcodesLoaded = false;

  // Reactive flags for Link/Pendulum (must be after selectedCard declaration)
  let isLink = $derived(selectedCard ? (selectedCard.type & 0x4000000) !== 0 : false);
  let isPend = $derived(selectedCard ? (selectedCard.type & 0x1000000) !== 0 : false);

  function handleImageError() {
    imageSrc = "/cover.jpg";
  }

  async function resolveImageSrc(picPath: string, bustCache = false): Promise<string> {
    try {
      const hasImage = await exists(picPath);
      if (!hasImage) return "/cover.jpg";
      const src = convertFileSrc(picPath);
      return bustCache ? `${src}?t=${Date.now()}` : src;
    } catch {
      return "/cover.jpg";
    }
  }

  $effect(() => {
    if (setcodesLoaded) return;
    setcodesLoaded = true;
    loadPopularSetcodes().then((options) => {
      popularSetcodes = options;
    });
  });

  $effect(() => {
    const card = getAllCardsMap().get(editorState.selectedId ?? -1);
    let cancelled = false;
    if (card) {
      if (selectedCard?.code !== card.code) {
        selectedCard = cloneEditableCard(card);

        for (let i = 0; i < 4; i++) {
          setcodeHexes[i] = getSetcode(selectedCard.setcode, i).replace(/^0x/i, "");
        }

        // Load image via Tauri asset protocol (zero-copy, no Base64 IPC overhead)
        if ($activeTab?.path) {
          const code = card.code;
          const cdbDir = $activeTab.path.substring(
            0,
            Math.max(
              $activeTab.path.lastIndexOf("\\"),
              $activeTab.path.lastIndexOf("/"),
            ),
          );
          const picPath = `${cdbDir}/pics/${code}.jpg`;
          resolveImageSrc(picPath).then((src) => {
            if (!cancelled) imageSrc = src;
          });
        } else {
          imageSrc = "/cover.jpg";
        }
      }
    } else {
      selectedCard = null;
      imageSrc = "/cover.jpg";
    }

    return () => {
      cancelled = true;
    };
  });

  async function handleImagePick() {
    if (!selectedCard || !$activeTab?.path) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["jpg", "png", "jpeg"] }],
    });
    if (selected && typeof selected === "string") {
      const cdbDir = $activeTab.path.substring(
        0,
        Math.max(
          $activeTab.path.lastIndexOf("\\"),
          $activeTab.path.lastIndexOf("/"),
        ),
      );
      const picPath = `${cdbDir}/pics/${selectedCard.code}.jpg`;
      try {
        await invoke("copy_image", { src: selected, dest: picPath });
        imageSrc = await resolveImageSrc(picPath, true);
      } catch (e) {
        console.error("Failed to copy image", e);
      }
    }
  }

  async function handleModify() {
    if (!selectedCard) return;
    const dbCard = new CardDataEntry();
    Object.assign(dbCard, selectedCard);
    if (selectedCard.strings) {
      dbCard.strings = [...selectedCard.strings];
    }
    if (modifyCard(dbCard)) {
      handleSearch(true);
      showToast($_('editor.card_modified', { values: { code: String(selectedCard.code) } }), 'success');
    } else {
      showToast($_('editor.card_no_change'), 'info');
    }
  }
  async function handleDelete() {
    if (!selectedCard) return;
    const confirmed = await ask(
      $_('editor.delete_confirm', { values: { code: String(selectedCard.code) } }),
      { title: $_('editor.delete_confirm_title'), kind: 'warning' },
    );
    if (!confirmed) return;
    const code = selectedCard.code;
    if (deleteCard(code)) {
      showToast($_('editor.card_deleted', { values: { code: String(code) } }), 'success');
      handleSearch();
    }
  }
  function handleResetEditor() {
    editorState.selectedId = null;
  }
  async function handleSave() {
    const ok = await saveCdbFile();
    if (ok) {
      showToast($_('editor.save_success'), 'success');
    } else {
      showToast($_('editor.save_failed'), 'error');
    }
  }
</script>

<div class="editor-area">
  {#if selectedCard}
    <!-- Header -->
    <div class="editor-header">
      <h2>{$_("editor.title")}</h2>
      <button
        class="btn-primary btn-sm"
        onclick={handleSave}
        disabled={!$isDbLoaded}>{$_("editor.save_db")}</button
      >
    </div>

    <!-- Top strip: ID / Alias / Name -->
    <div class="top-strip">
      <div class="strip-field" style="width:120px">
        <label for="edit-id">{$_("editor.id")}</label>
        <input type="number" id="edit-id" bind:value={selectedCard.code} />
      </div>
      <div class="strip-field" style="width:90px">
        <label for="edit-alias">{$_("editor.alias")}</label>
        <input type="number" id="edit-alias" bind:value={selectedCard.alias} />
      </div>
      <div class="strip-field" style="flex:1">
        <label for="edit-name">{$_("editor.name")}</label>
        <input type="text" id="edit-name" bind:value={selectedCard.name} />
      </div>
    </div>

    <!-- Two-column body -->
    <div class="editor-columns">
      <!-- LEFT column: Image+Stats, then Types, then Desc -->
      <div class="editor-col">
        <!-- Image + Attribute/Race/ATK/DEF/Level side by side -->
        <div class="card-top-row">
          <button
            class="image-picker"
            onclick={handleImagePick}
            aria-label="Select image"
          >
            {#if imageSrc}
              <img
                src={imageSrc}
                alt="Card"
                class="card-img"
                onerror={handleImageError}
              />
            {:else}
              <div class="no-img">📷</div>
            {/if}
          </button>
          <div class="stats-beside-img">
            <div class="inline-field">
              <label for="edit-ot">OT</label>
              <select
                id="edit-ot"
                bind:value={selectedCard!.ot}
              >
                {#each PERMISSION_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-attribute">{$_("editor.attribute")}</label>
              <select
                id="edit-attribute"
                bind:value={selectedCard!.attribute}
              >
                {#each ATTRIBUTE_OPTIONS as opt}
                  <option value={opt.value}>{opt.key ? $_(opt.key) : opt.label}</option>
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-race">{$_("editor.race")}</label>
              <select id="edit-race" bind:value={selectedCard!.race}>
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
                  selectedCard!.level = setPackedLevel(
                    parseInt(t.value),
                    getPackedLScale(selectedCard!.level),
                    getPackedRScale(selectedCard!.level),
                  );
                }}
              >
                {#each Array.from({ length: 13 }, (_, i) => i) as lvl}
                  <option
                    value={lvl}
                    selected={getPackedLevel(selectedCard!.level) === lvl}
                    >{lvl}</option
                  >
                {/each}
              </select>
            </div>
            <div class="inline-field">
              <label for="edit-atk">{$_("editor.atk")}</label>
              <input
                type="number"
                id="edit-atk"
                bind:value={selectedCard!.attack}
              />
            </div>
            <div class="inline-field">
              <label for="edit-def">{$_("editor.def")}</label>
              <input
                type="number"
                id="edit-def"
                bind:value={selectedCard!.defense}
              />
            </div>
          </div>
        </div>

        <!-- Type checkboxes -->
        <div class="fg">
          <span class="group-label">{$_("editor.types")}</span>
          <div class="checkbox-grid">
            {#each TYPE_BITS as tb}
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={(selectedCard!.type & tb.bit) !== 0}
                  onchange={(e) => {
                    const t = e.target as HTMLInputElement;
                    if (t.checked) selectedCard!.type |= tb.bit;
                    else selectedCard!.type &= ~tb.bit;
                  }}
                />
                {$_(tb.key)}
              </label>
            {/each}
          </div>
        </div>

        <!-- Description at bottom, fills remaining space -->
        <div class="fg flex-1-min">
          <label for="edit-desc">{$_("editor.desc")}</label>
          <textarea id="edit-desc" bind:value={selectedCard!.desc}></textarea>
        </div>
      </div>

      <!-- RIGHT column: Setcodes, then Link/Pendulum, then Hints -->
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
                    if (val === "__custom__") {
                      // Do nothing, let user type in input
                    } else if (val === "") {
                      setcodeHexes[idx] = "";
                      selectedCard!.setcode = updateSetcode(selectedCard!.setcode, idx, "");
                    } else {
                      setcodeHexes[idx] = val.replace(/^0x/i, "");
                      selectedCard!.setcode = updateSetcode(selectedCard!.setcode, idx, val);
                    }
                  }}
                >
                  <option value="">—</option>
                  {#each popularSetcodes as opt}
                    <option value={opt.value} selected={dropdownValue === opt.value}>{opt.label}</option>
                  {/each}
                  {#if dropdownValue === "__custom__"}
                    <option value="__custom__" selected>{$_("editor.custom") ?? "自定义"} ({hexString})</option>
                  {/if}
                </select>
                <div class="hex-input">
                  <span class="hex-prefix">0x</span>
                  <input
                    type="text"
                    bind:value={setcodeHexes[idx]}
                    oninput={() => {
                      selectedCard!.setcode = updateSetcode(
                        selectedCard!.setcode,
                        idx,
                        setcodeHexes[idx] ? "0x" + setcodeHexes[idx] : ""
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
          <!-- Link Markers (Left) -->
          <div class="fg" class:disabled-opacity={!isLink}>
            <span class="group-label">{$_("editor.link_markers")}</span>
            <div class="link-marker-grid">
              {#each LINK_MARKERS as lm}
                <button
                  class="link-arrow"
                  class:active={isLink && (selectedCard!.linkMarker & lm.bit) !== 0}
                  disabled={!isLink}
                  style="grid-row:{lm.row + 1};grid-column:{lm.col + 1}"
                  onclick={() => (selectedCard!.linkMarker ^= lm.bit)}
                  >{lm.label}</button
                >
              {/each}
              <div class="link-center" style="grid-row:2;grid-column:2">⬡</div>
            </div>
          </div>

          <!-- Pendulum Scale (Right) -->
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
                  bind:value={selectedCard!.lscale}
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
                  bind:value={selectedCard!.rscale}
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
                <input
                  type="text"
                  bind:value={selectedCard!.strings[idx]}
                />
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom actions -->
    <div class="editor-bottom">
      <button class="btn-secondary btn-sm" onclick={handleResetEditor}
        >{$_("editor.reset_editor")}</button
      >
      <div class="btn-group">
        <button class="btn-primary btn-sm" onclick={handleModify}
          >{$_("editor.modify")}</button
        >
        <button class="btn-danger btn-sm" onclick={handleDelete}
          >{$_("editor.delete")}</button
        >
      </div>
    </div>
  {:else}
    <div class="editor-empty">{$_("editor.no_card")}</div>
  {/if}
</div>

<style>
  .editor-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    min-width: 0;
    overflow: hidden;
  }
  .editor-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .editor-header {
    height: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--border-color);
  }
  .editor-header h2 {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .top-strip {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-base);
  }
  .strip-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .strip-field label {
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
  .strip-field input {
    padding: 3px 6px;
    font-size: 0.8rem;
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

  /* ── Card image + stats row ── */
  .card-top-row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  .image-picker {
    width: 130px;
    min-width: 130px;
    aspect-ratio: 0.69;
    background: var(--bg-base);
    border: 1px dashed var(--border-color);
    border-radius: 4px;
    padding: 2px;
    cursor: pointer;
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

  /* ── Form helpers ── */
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
    font-size: 0.7rem;
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
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-weight: 500;
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
    font-size: 0.8rem;
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
    font-size: 0.85rem;
    padding: 6px;
  }

  /* ── Type checkboxes ── */
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
    font-size: 0.7rem;
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

  /* ── Setcodes ── */
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
    font-size: 0.75rem;
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
    font-size: 0.75rem;
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
    font-size: 0.8rem;
  }
  .hex-input input:focus {
    box-shadow: none;
    outline: none;
  }

  /* ── Link markers ── */
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
    cursor: pointer;
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


  /* ── Hints ── */
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
    font-size: 0.65rem;
    color: var(--text-secondary);
    min-width: 26px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .hint-row input {
    border: none;
    background: transparent;
    padding: 2px 0;
    font-size: 0.75rem;
  }
  .hint-row input:focus {
    box-shadow: none;
  }

  /* ── Bottom actions ── */
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

  /* ── Buttons ── */
  button {
    font-size: 0.8rem;
    font-weight: 500;
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
    padding: 3px 8px;
    font-size: 0.75rem;
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
    background: #444;
  }
  .btn-danger {
    background: #dc2626;
    color: white;
  }
  .btn-danger:hover {
    background: #b91c1c;
  }
</style>
