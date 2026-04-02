<script lang="ts">
  import { _ } from "svelte-i18n";
  import SetcodeField from "$lib/components/SetcodeField.svelte";
  import type { CardDataEntry } from "$lib/types";
  import {
    ATTRIBUTE_OPTIONS,
    getPackedLevel,
    LINK_MARKERS,
    PERMISSION_OPTIONS,
    RACE_OPTIONS,
    TYPE_BITS,
  } from "$lib/utils/card";

  export let draftCard: CardDataEntry;
  export let imageSrc = "";
  export let imageAriaLabel = "";
  export let imageTitle = "";
  export let noImageLabel = "";
  export let isLink = false;
  export let isPend = false;
  export let setcodeSlotIndices: readonly number[] = [];
  export let setcodeHexes: string[] = [];
  export let popularSetcodes: { value: string; label: string }[] = [];
  export let popularSetcodeValues: Set<string> = new Set();
  export let customSetcodeLabel = "";
  export let licenseLabel = "";
  export let attributeLabel = "";
  export let raceLabel = "";
  export let levelLabel = "";
  export let levelNoneLabel = "";
  export let atkLabel = "";
  export let defLabel = "";
  export let typesLabel = "";
  export let descLabel = "";
  export let setcodesLabel = "";
  export let linkMarkersLabel = "";
  export let scaleLabel = "";
  export let scaleLeftLabel = "";
  export let scaleRightLabel = "";
  export let hintsLabel = "";
  export let onImageClick: () => void = () => {};
  export let onImageDoubleClick: (event: MouseEvent) => void = () => {};
  export let onImageError: (failedSrc: string) => void = () => {};
  export let onSetcodeSelectChange: (index: number, value: string) => void = () => {};
  export let onSetcodeHexChange: (index: number, value: string) => void = () => {};
  export let onUpdateDraftLevel: (nextLevel: number) => void = () => {};
  export let onUpdateDraftScale: (side: "left" | "right", nextScale: number) => void = () => {};
</script>

<div class="editor-columns">
  <div class="editor-col">
    <div class="card-top-row">
      <button
        class="image-picker"
        onclick={onImageClick}
        ondblclick={onImageDoubleClick}
        aria-label={imageAriaLabel}
        title={imageTitle}
      >
        {#if imageSrc}
          {#key imageSrc}
            <img
              src={imageSrc}
              alt="Card"
              class="card-img"
              onerror={() => onImageError(imageSrc)}
            />
          {/key}
        {:else}
          <div class="no-img">{noImageLabel}</div>
        {/if}
      </button>
      <div class="stats-beside-img">
        <div class="inline-field">
          <label for="edit-ot">{licenseLabel}</label>
          <select id="edit-ot" bind:value={draftCard.ot}>
            {#each PERMISSION_OPTIONS as opt}
              <option value={opt.value}>{opt.label}</option>
            {/each}
          </select>
        </div>
        <div class="inline-field">
          <label for="edit-attribute">{attributeLabel}</label>
          <select id="edit-attribute" bind:value={draftCard.attribute}>
            {#each ATTRIBUTE_OPTIONS as opt}
              <option value={opt.value}>{opt.key ? $_(opt.key) : opt.label}</option>
            {/each}
          </select>
        </div>
        <div class="inline-field">
          <label for="edit-race">{raceLabel}</label>
          <select id="edit-race" bind:value={draftCard.race}>
            {#each RACE_OPTIONS as r}
              <option value={r.value}>{r.key ? $_(r.key) : ""}</option>
            {/each}
          </select>
        </div>
        <div class="inline-field">
          <label for="edit-level">{levelLabel}</label>
          <select
            id="edit-level"
            value={getPackedLevel(draftCard.level)}
            onchange={(e) => {
              const t = e.target as HTMLSelectElement;
              onUpdateDraftLevel(parseInt(t.value, 10));
            }}
          >
            <option value={0}>{levelNoneLabel}</option>
            {#each Array.from({ length: 13 }, (_, i) => i + 1) as lvl}
              <option value={lvl}>{lvl}</option>
            {/each}
          </select>
        </div>
        <div class="inline-field">
          <label for="edit-atk">{atkLabel}</label>
          <input type="number" id="edit-atk" bind:value={draftCard.attack} />
        </div>
        <div class="inline-field">
          <label for="edit-def">{defLabel}</label>
          <input type="number" id="edit-def" bind:value={draftCard.defense} disabled={isLink} />
        </div>
      </div>
    </div>

    <div class="fg">
      <span class="group-label">{typesLabel}</span>
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
      <label for="edit-desc">{descLabel}</label>
      <textarea id="edit-desc" bind:value={draftCard.desc}></textarea>
    </div>
  </div>

  <div class="editor-col">
    <div class="fg">
      <span class="group-label">{setcodesLabel}</span>
      <div class="setcode-grid">
        {#each setcodeSlotIndices as idx (idx)}
          <SetcodeField
            index={idx}
            hexValue={setcodeHexes[idx]}
            options={popularSetcodes}
            knownValues={popularSetcodeValues}
            customLabel={customSetcodeLabel}
            onSelectChange={onSetcodeSelectChange}
            onHexChange={onSetcodeHexChange}
          />
        {/each}
      </div>
    </div>

    <div class="row-2 align-start">
      <div class="fg" class:disabled-opacity={!isLink}>
        <span class="group-label">{linkMarkersLabel}</span>
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
        <span class="group-label">{scaleLabel}</span>
        <div class="row-2">
          <div class="fg">
            <label for="edit-lscale">{scaleLeftLabel}</label>
            <input
              type="number"
              id="edit-lscale"
              min="0"
              max="13"
              disabled={!isPend}
              value={draftCard.lscale}
              oninput={(event) => onUpdateDraftScale("left", Number((event.currentTarget as HTMLInputElement).value))}
            />
          </div>
          <div class="fg">
            <label for="edit-rscale">{scaleRightLabel}</label>
            <input
              type="number"
              id="edit-rscale"
              min="0"
              max="13"
              disabled={!isPend}
              value={draftCard.rscale}
              oninput={(event) => onUpdateDraftScale("right", Number((event.currentTarget as HTMLInputElement).value))}
            />
          </div>
        </div>
      </div>
    </div>

    <div class="fg" style="flex:1; min-height:0;">
      <span class="group-label">{hintsLabel}</span>
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

<style>
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
