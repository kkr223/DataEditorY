<script lang="ts">
  import { _, locale } from "svelte-i18n";
  import SetcodeField from "$lib/components/SetcodeField.svelte";
  import { disableAutofill } from "$lib/actions/disableAutofill";
  import type { CardDataEntry } from "$lib/types";
  import {
    ATTRIBUTE_OPTIONS,
    formatEditableScaleValue,
    formatEditableStatValue,
    getPackedLevel,
    LINK_MARKERS,
    parseEditableScaleInput,
    parseEditableStatInput,
    PERMISSION_OPTIONS,
    RACE_OPTIONS,
  } from "$lib/utils/card";
  import { SUBTYPE_MAP, TYPE_MAP } from "$lib/domain/card/taxonomy";

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

  type TypeOption = { bit: number; key: string };
  type TypeSection = { rows: TypeOption[][] };

  const TYPE_SECTIONS: TypeSection[] = [
    {
      rows: [
        [
          { bit: TYPE_MAP.monster, key: "editor.subtype.monster" },
          { bit: SUBTYPE_MAP.effect, key: "editor.subtype.effect" },
          { bit: SUBTYPE_MAP.tuner, key: "editor.subtype.tuner" },
          { bit: SUBTYPE_MAP.normal, key: "editor.subtype.normal" },
          { bit: SUBTYPE_MAP.pendulum, key: "editor.subtype.pendulum" },
        ],
        [
          { bit: SUBTYPE_MAP.ritual, key: "editor.subtype.ritual" },
          { bit: SUBTYPE_MAP.fusion, key: "editor.subtype.fusion" },
          { bit: SUBTYPE_MAP.synchro, key: "editor.subtype.synchro" },
          { bit: SUBTYPE_MAP.xyz, key: "editor.subtype.xyz" },
          { bit: SUBTYPE_MAP.link, key: "editor.subtype.link" },
        ],
        [
          { bit: SUBTYPE_MAP.toon, key: "editor.subtype.toon" },
          { bit: SUBTYPE_MAP.spirit, key: "editor.subtype.spirit" },
          { bit: SUBTYPE_MAP.flip, key: "editor.subtype.flip" },
          { bit: SUBTYPE_MAP.union, key: "editor.subtype.union" },
          { bit: SUBTYPE_MAP.gemini, key: "editor.subtype.gemini" },
        ],
        [
          { bit: SUBTYPE_MAP.spssummon, key: "editor.subtype.spssummon" },
          { bit: SUBTYPE_MAP.token, key: "editor.subtype.token" },
        ],
      ],
    },
    {
      rows: [[
        { bit: TYPE_MAP.spell, key: "editor.subtype.spell" },
        { bit: SUBTYPE_MAP.quickplay, key: "editor.subtype.quickplay" },
        { bit: SUBTYPE_MAP.equip, key: "editor.subtype.equip" },
        { bit: SUBTYPE_MAP.field, key: "editor.subtype.field" },
        { bit: SUBTYPE_MAP.ritual_spell, key: "editor.subtype.ritual" },
      ]],
    },
    {
      rows: [[
        { bit: TYPE_MAP.trap, key: "editor.subtype.trap" },
        { bit: SUBTYPE_MAP.continuous_trap, key: "editor.subtype.continuous" },
        { bit: SUBTYPE_MAP.counter, key: "editor.subtype.counter" },
      ]],
    },
  ];

  let isEnglishLocale = false;
  let attackInput = "";
  let defenseInput = "";
  let leftScaleInput = "";
  let rightScaleInput = "";
  $: isEnglishLocale = ($locale ?? "").startsWith("en");
  $: attackInput = formatEditableStatValue(draftCard.attack);
  $: defenseInput = isLink ? "0" : formatEditableStatValue(draftCard.defense);
  $: leftScaleInput = formatEditableScaleValue(draftCard.lscale);
  $: rightScaleInput = formatEditableScaleValue(draftCard.rscale);

  function handleAttackInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    attackInput = target.value;
    draftCard.attack = parseEditableStatInput(target.value, draftCard.attack);
  }

  function handleDefenseInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    defenseInput = target.value;
    if (isLink) {
      draftCard.defense = 0;
      return;
    }
    draftCard.defense = parseEditableStatInput(target.value, draftCard.defense);
  }

  function handleScaleInput(side: "left" | "right", event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    if (side === "left") {
      leftScaleInput = target.value;
    } else {
      rightScaleInput = target.value;
    }
    onUpdateDraftScale(side, parseEditableScaleInput(target.value, side === "left" ? draftCard.lscale : draftCard.rscale));
  }
</script>

<div class="editor-columns" use:disableAutofill>
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
        <div class="compact-link-panel">
          <label class="compact-panel-label compact-panel-main-label compact-panel-value-label" for="edit-atk">{atkLabel}</label>
          <span class="compact-panel-label compact-panel-title" title={linkMarkersLabel}></span>
          <label class="compact-panel-label compact-panel-main-label compact-panel-value-label" for="edit-def">{defLabel}</label>

          <input
            class="compact-panel-input compact-panel-value-input"
            type="text"
            inputmode="numeric"
            id="edit-atk"
            value={attackInput}
            oninput={handleAttackInput}
          />

          <div class="compact-link-section" class:disabled-opacity={!isLink}>
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

          <input
            class="compact-panel-input compact-panel-value-input"
            type="text"
            inputmode="numeric"
            id="edit-def"
            value={defenseInput}
            oninput={handleDefenseInput}
            disabled={isLink}
          />

          <div class="compact-scale-slot compact-scale-slot-left" class:disabled-opacity={!isPend} title={`${scaleLabel} ${scaleLeftLabel}`}>
            <label class="compact-panel-label compact-panel-scale-label compact-panel-label-center" for="edit-lscale" title={scaleLeftLabel}></label>
            <input
              class="compact-panel-input"
              type="text"
              inputmode="numeric"
              id="edit-lscale"
              disabled={!isPend}
              value={leftScaleInput}
              oninput={(event) => handleScaleInput("left", event)}
            />
          </div>
          <div class="compact-scale-slot compact-scale-slot-right" class:disabled-opacity={!isPend} title={`${scaleLabel} ${scaleRightLabel}`}>
            <label class="compact-panel-label compact-panel-scale-label compact-panel-label-center" for="edit-rscale" title={scaleRightLabel}></label>
            <input
              class="compact-panel-input"
              type="text"
              inputmode="numeric"
              id="edit-rscale"
              disabled={!isPend}
              value={rightScaleInput}
              oninput={(event) => handleScaleInput("right", event)}
            />
          </div>
        </div>
      </div>
    </div>

    <div class="fg flex-1-min">
      <label for="edit-desc">{descLabel}</label>
      <textarea id="edit-desc" bind:value={draftCard.desc}></textarea>
    </div>
  </div>

  <div class="editor-col">
    <div class="fg">
      <span class="group-label">{typesLabel}</span>
      <div class="type-sections">
        {#each TYPE_SECTIONS as section, sectionIndex}
          <div class="type-section" class:with-separator={sectionIndex > 0}>
            {#each section.rows as row}
              <div class="type-row">
                {#each row as option}
                  <label class="checkbox-label" class:checkbox-label-condensed={isEnglishLocale}>
                    <input
                      type="checkbox"
                      checked={(draftCard.type & option.bit) !== 0}
                      onchange={(e) => {
                        const t = e.target as HTMLInputElement;
                        if (t.checked) draftCard.type |= option.bit;
                        else draftCard.type &= ~option.bit;
                      }}
                    />
                    {$_(option.key)}
                  </label>
                {/each}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>

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
    min-height: 0;
  }

  .editor-col {
    flex: 1 1 0;
    padding: 0.4rem 0.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .editor-col:first-child {
    flex: 1.08 1 0;
    border-right: 1px solid var(--border-color);
  }

  .editor-col:last-child {
    flex: 0.92 1 0;
  }

  .card-top-row {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.3rem;
    align-items: flex-end;
  }

  .image-picker {
    width: 9.75rem;
    min-width: 9.75rem;
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
    align-self: auto;
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
    flex: 1 1 13.75rem;
    min-width: 13.75rem;
    display: flex;
    flex-direction: column;
    gap: 1px;
    justify-content: flex-start;
  }

  .fg {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0.2rem;
  }

  .compact-link-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    grid-template-rows: auto auto auto auto;
    column-gap: 0.45rem;
    row-gap: 0.12rem;
    margin-top: auto;
    padding-top: 0.45rem;
    align-items: center;
  }

  .compact-panel-title {
    text-align: center;
    min-height: 0.82rem;
  }

  .compact-panel-label {
    font-size: 0.78rem;
    margin: 0;
    line-height: 1;
  }

  .compact-panel-main-label {
    margin-bottom: 0.14rem;
  }

  .compact-panel-value-label {
    text-align: left;
    padding-left: 0.35rem;
  }

  .compact-panel-label-center {
    text-align: center;
  }

  .compact-panel-scale-label::before {
    display: inline-block;
    line-height: 1;
    color: var(--text-primary);
  }

  .compact-panel-scale-label[for="edit-lscale"]::before {
    content: "←";
  }

  .compact-panel-scale-label[for="edit-rscale"]::before {
    content: "→";
  }

  .compact-panel-input {
    text-align: center;
    min-height: 1.8rem;
    padding: 3px 6px;
  }

  .compact-panel-value-input {
    text-align: left;
  }

  .compact-panel-value-input::-webkit-outer-spin-button,
  .compact-panel-value-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .compact-panel-value-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .compact-link-section {
    grid-column: 2;
    grid-row: 2 / 5;
    display: flex;
    justify-content: center;
  }

  .compact-scale-slot {
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
    align-self: end;
  }

  .compact-scale-slot-left {
    grid-column: 1;
    grid-row: 4;
  }

  .compact-scale-slot-right {
    grid-column: 3;
    grid-row: 4;
  }

  .inline-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.3rem;
    padding: 0;
  }

  .inline-field label {
    min-width: 3.35rem;
    font-size: 0.82rem;
    color: var(--text-secondary);
    text-align: left;
    margin: 0;
    flex-shrink: 0;
  }

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
    gap: 2px;
  }

  .flex-1-min textarea {
    flex: 1;
    min-height: 6rem;
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

  .type-sections {
    display: flex;
    flex-direction: column;
    gap: 0.533rem;
    background: var(--bg-base);
    padding: 0.533rem 0.667rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .type-section {
    display: flex;
    flex-direction: column;
    gap: 0.533rem;
  }

  .type-section.with-separator {
    border-top: 1px solid var(--border-color);
    padding-top: 0.533rem;
  }

  .type-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.267rem 0.8rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.333rem;
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

  .checkbox-label-condensed {
    font-size: 0.78rem;
    letter-spacing: -0.02em;
    font-stretch: condensed;
  }

  .setcode-grid {
    display: flex;
    flex-direction: column;
    gap: 3px;
    background: var(--bg-base);
    padding: 0.4rem;
    border-radius: 4px;
    border: 1px solid var(--border-color);
  }

  .link-marker-grid {
    display: grid;
    grid-template-columns: 1.75rem 1.75rem 1.75rem;
    grid-template-rows: 1.75rem 1.75rem 1.75rem;
    gap: 0.15rem;
    justify-content: start;
  }

  .link-arrow {
    width: 1.75rem;
    height: 1.75rem;
    font-size: 0.85rem;
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

  .disabled-opacity button,
  .disabled-opacity input {
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
    min-height: 9rem;
    overflow-y: auto;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--bg-base);
  }

  .hint-row {
    display: flex;
    align-items: center;
    gap: 0.267rem;
    padding: 0 0.4rem;
    border-bottom: 1px solid var(--border-color);
  }

  .hint-row:last-child {
    border-bottom: none;
  }

  .hint-label {
    font-size: 0.76rem;
    color: var(--text-secondary);
    min-width: 1.733rem;
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

</style>
