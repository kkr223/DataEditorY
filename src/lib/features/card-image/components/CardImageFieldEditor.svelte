<script lang="ts">
  import { _ } from 'svelte-i18n';
  import {
    CARD_IMAGE_ATTRIBUTE_OPTIONS,
    CARD_IMAGE_CARD_TYPE_OPTIONS,
    CARD_IMAGE_COPYRIGHT_OPTIONS,
    CARD_IMAGE_FONT_OPTIONS,
    CARD_IMAGE_ICON_OPTIONS,
    CARD_IMAGE_LANGUAGE_OPTIONS,
    CARD_IMAGE_LASER_OPTIONS,
    CARD_IMAGE_PENDULUM_TYPE_OPTIONS,
    CARD_IMAGE_RARE_OPTIONS,
    CARD_IMAGE_TYPE_OPTIONS,
    normalizeCardImageFormData,
    type CardImageFormData,
  } from '$lib/utils/cardImage';
  import type { ColorPreset } from '$lib/features/card-image/controller';
  import {
    MAX_EXPORT_SCALE_PERCENT,
    MAX_FOREGROUND_SCALE,
    MIN_EXPORT_SCALE_PERCENT,
    MIN_FOREGROUND_SCALE,
  } from '$lib/features/card-image/controller';

  let {
    variant,
    form = $bindable<CardImageFormData>(),
    exportScalePercent = $bindable<number>(43),
    nameColorPresets = [],
    getOptionLabel = (option: { value: string; label?: string; labelKey?: string }) => option.label ?? option.value,
    onClearCustomNameColor = () => {},
    onApplyNameColorPreset = (_color: string) => {},
    isNameColorPresetActive = (_color: string) => false,
    onClearCustomNameShadowColor = () => {},
    onApplyNameShadowColorPreset = (_color: string) => {},
    isNameShadowColorPresetActive = (_color: string) => false,
    hasForegroundImage = false,
  }: {
    variant: 'main' | 'foreground';
    form: CardImageFormData;
    exportScalePercent?: number;
    nameColorPresets?: ColorPreset[];
    getOptionLabel?: (option: { value: string; label?: string; labelKey?: string }) => string;
    onClearCustomNameColor?: () => void;
    onApplyNameColorPreset?: (color: string) => void;
    isNameColorPresetActive?: (color: string) => boolean;
    onClearCustomNameShadowColor?: () => void;
    onApplyNameShadowColorPreset?: (color: string) => void;
    isNameShadowColorPresetActive?: (color: string) => boolean;
    hasForegroundImage?: boolean;
  } = $props();

  function updateColorField(key: keyof CardImageFormData, value: string) {
    form = normalizeCardImageFormData({
      ...form,
      [key]: value,
    });
  }
</script>

{#snippet colorPresetList(active: (color: string) => boolean, apply: (color: string) => void)}
  <div class="color-preset-group">
    <span class="color-preset-label">{$_('editor.card_image_name_color_presets')}</span>
    <div class="color-preset-list">
      {#each nameColorPresets as preset}
        <button
          class={`color-preset-chip ${active(preset.value) ? 'is-active' : ''}`}
          type="button"
          style={`--preset-color:${preset.value};`}
          title={$_(preset.labelKey)}
          aria-label={`${$_(preset.labelKey)} ${preset.value}`}
          onclick={() => apply(preset.value)}
        >
          <span class="color-preset-swatch" aria-hidden="true"></span>
        </button>
      {/each}
    </div>
  </div>
{/snippet}

{#if variant === 'main'}
  <section class="drawer-section">
    <div class="section-title">{$_('editor.card_image_form_basic')}</div>
    <div class="field-grid">
      <label class="field"><span>{$_('editor.name')}</span><input type="text" bind:value={form.name} /></label>
      <label class="field"><span>{$_('editor.card_image_language')}</span><select bind:value={form.language}>{#each CARD_IMAGE_LANGUAGE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <label class="field"><span>{$_('editor.card_image_type')}</span><select bind:value={form.type}>{#each CARD_IMAGE_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <label class="field"><span>{$_('editor.card_image_card_type')}</span><select bind:value={form.cardType}>{#each CARD_IMAGE_CARD_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>

      {#if form.type === 'pendulum'}
        <label class="field"><span>{$_('editor.card_image_pendulum_type')}</span><select bind:value={form.pendulumType}>{#each CARD_IMAGE_PENDULUM_TYPE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      {/if}

      {#if form.type === 'monster' || form.type === 'pendulum'}
        <label class="field"><span>{$_('editor.attribute')}</span><select bind:value={form.attribute}>{#each CARD_IMAGE_ATTRIBUTE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
        <label class="field"><span>{$_('editor.card_image_monster_type')}</span><input type="text" bind:value={form.monsterType} /></label>

        {#if form.type === 'pendulum' ? form.pendulumType === 'xyz-pendulum' : form.cardType === 'xyz'}
          <label class="field"><span>{$_('editor.level')}</span><input type="number" min="0" bind:value={form.rank} /></label>
        {:else if form.type === 'pendulum' ? form.pendulumType !== 'link-pendulum' : form.cardType !== 'link'}
          <label class="field"><span>{$_('editor.level')}</span><input type="number" min="0" bind:value={form.level} /></label>
        {/if}

        {#if form.type === 'pendulum'}
          <label class="field"><span>{$_('editor.scale')}</span><input type="number" min="0" max="13" bind:value={form.pendulumScale} /></label>
        {/if}

        <label class="field"><span>{$_('editor.atk')}</span><input type="number" bind:value={form.atk} /></label>
        {#if form.type === 'pendulum' ? form.pendulumType !== 'link-pendulum' : form.cardType !== 'link'}
          <label class="field"><span>{$_('editor.def')}</span><input type="number" bind:value={form.def} /></label>
        {/if}
      {/if}

      {#if form.type === 'spell' || form.type === 'trap'}
        <label class="field"><span>{$_('editor.card_image_icon')}</span><select bind:value={form.icon}>{#each CARD_IMAGE_ICON_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      {/if}
    </div>
  </section>

  <section class="drawer-section">
    <div class="section-title">{$_('editor.card_image_form_text')}</div>
    <div class="field-stack">
      <label class="field"><span>{$_('editor.desc')}</span><textarea rows="7" bind:value={form.description}></textarea></label>
      {#if form.type === 'pendulum'}
        <label class="field"><span>{$_('editor.card_image_pendulum_text')}</span><textarea rows="4" bind:value={form.pendulumDescription}></textarea></label>
      {/if}
    </div>
  </section>

  <section class="drawer-section">
    <div class="section-title">{$_('editor.card_image_form_style')}</div>
    <div class="field-grid">
      <label class="field"><span>{$_('editor.card_image_font')}</span><select bind:value={form.font}>{#each CARD_IMAGE_FONT_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <div class="field field-color">
        <span>{$_('editor.card_image_name_color')}</span>
        <div class="color-input-row">
          <input class="color-swatch" type="color" value={form.color || '#000000'} onchange={(event) => updateColorField('color', (event.currentTarget as HTMLInputElement).value)} />
          <input type="text" placeholder={$_('editor.card_image_name_color_placeholder')} bind:value={form.color} />
          <button class="btn-secondary btn-sm" type="button" onclick={onClearCustomNameColor}>{$_('editor.card_image_name_color_reset')}</button>
        </div>
        {@render colorPresetList(isNameColorPresetActive, onApplyNameColorPreset)}
        <label class="toggle gradient-toggle"><input type="checkbox" bind:checked={form.gradient} /><span>{$_('editor.card_image_gradient_enable')}</span></label>
        {#if form.gradient}
          <div class="subfield-grid">
            <label class="field">
              <span>{$_('editor.card_image_gradient_color_start')}</span>
              <div class="color-input-row color-input-row-compact">
                <input class="color-swatch" type="color" value={form.gradientColor1 || '#999999'} onchange={(event) => updateColorField('gradientColor1', (event.currentTarget as HTMLInputElement).value)} />
                <input type="text" bind:value={form.gradientColor1} />
              </div>
            </label>
            <label class="field">
              <span>{$_('editor.card_image_gradient_color_end')}</span>
              <div class="color-input-row color-input-row-compact">
                <input class="color-swatch" type="color" value={form.gradientColor2 || '#ffffff'} onchange={(event) => updateColorField('gradientColor2', (event.currentTarget as HTMLInputElement).value)} />
                <input type="text" bind:value={form.gradientColor2} />
              </div>
            </label>
          </div>
        {/if}
        <small class="field-hint">{$_('editor.card_image_name_color_hint')}</small>
      </div>
      <div class="field field-color">
        <span>{$_('editor.card_image_name_shadow_color')}</span>
        <div class="color-input-row">
          <input class="color-swatch" type="color" value={form.nameShadowColor || '#111827'} onchange={(event) => updateColorField('nameShadowColor', (event.currentTarget as HTMLInputElement).value)} />
          <input type="text" placeholder={$_('editor.card_image_name_color_placeholder')} bind:value={form.nameShadowColor} />
          <button class="btn-secondary btn-sm" type="button" onclick={onClearCustomNameShadowColor}>{$_('editor.card_image_name_color_reset')}</button>
        </div>
        {@render colorPresetList(isNameShadowColorPresetActive, onApplyNameShadowColorPreset)}
        <label class="toggle gradient-toggle"><input type="checkbox" bind:checked={form.nameShadowGradient} /><span>{$_('editor.card_image_gradient_enable')}</span></label>
        {#if form.nameShadowGradient}
          <div class="subfield-grid">
            <label class="field">
              <span>{$_('editor.card_image_gradient_color_start')}</span>
              <div class="color-input-row color-input-row-compact">
                <input class="color-swatch" type="color" value={form.nameShadowGradientColor1 || '#1f2937'} onchange={(event) => updateColorField('nameShadowGradientColor1', (event.currentTarget as HTMLInputElement).value)} />
                <input type="text" bind:value={form.nameShadowGradientColor1} />
              </div>
            </label>
            <label class="field">
              <span>{$_('editor.card_image_gradient_color_end')}</span>
              <div class="color-input-row color-input-row-compact">
                <input class="color-swatch" type="color" value={form.nameShadowGradientColor2 || '#0f172a'} onchange={(event) => updateColorField('nameShadowGradientColor2', (event.currentTarget as HTMLInputElement).value)} />
                <input type="text" bind:value={form.nameShadowGradientColor2} />
              </div>
            </label>
          </div>
        {/if}
        <small class="field-hint">{$_('editor.card_image_name_shadow_color_hint')}</small>
      </div>
      <label class="field"><span>{$_('editor.card_image_rarity')}</span><select bind:value={form.rare}>{#each CARD_IMAGE_RARE_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <label class="field"><span>{$_('editor.card_image_laser')}</span><select bind:value={form.laser}>{#each CARD_IMAGE_LASER_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <label class="field"><span>{$_('editor.card_image_copyright')}</span><select bind:value={form.copyright}>{#each CARD_IMAGE_COPYRIGHT_OPTIONS as option}<option value={option.value}>{getOptionLabel(option)}</option>{/each}</select></label>
      <label class="field"><span>{$_('editor.card_image_package')}</span><input type="text" bind:value={form.package} /></label>
      <label class="field"><span>{$_('editor.card_image_password')}</span><input type="text" bind:value={form.password} /></label>
      <label class="field field-span-2">
        <span>{$_('editor.card_image_export_scale', { values: { percent: String(exportScalePercent) } })}</span>
        <input type="range" min={MIN_EXPORT_SCALE_PERCENT} max={MAX_EXPORT_SCALE_PERCENT} step="1" bind:value={exportScalePercent} />
        <small class="field-hint">{$_('editor.card_image_export_scale_hint')}</small>
      </label>
      <label class="field"><span>{$_('editor.card_image_description_zoom')}</span><input type="number" min="0.5" step="0.1" bind:value={form.descriptionZoom} /></label>
      <label class="field"><span>{$_('editor.card_image_description_weight')}</span><input type="number" min="0" step="100" bind:value={form.descriptionWeight} /></label>
    </div>

    <div class="toggle-grid">
      <label class="toggle"><input type="checkbox" bind:checked={form.firstLineCompress} /><span>{$_('editor.card_image_first_line_compress')}</span></label>
      <label class="toggle"><input type="checkbox" bind:checked={form.descriptionAlign} /><span>{$_('editor.card_image_description_center')}</span></label>
      <label class="toggle"><input type="checkbox" bind:checked={form.twentieth} /><span>{$_('editor.card_image_twentieth')}</span></label>
      <label class="toggle"><input type="checkbox" bind:checked={form.radius} /><span>{$_('editor.card_image_round_corner')}</span></label>
    </div>
  </section>
{:else}
  <p class="field-hint">
    {#if hasForegroundImage}
      {$_('editor.card_image_foreground_ready')}
    {:else}
      {$_('editor.card_image_foreground_empty')}
    {/if}
  </p>

  <div class="drawer-section foreground-section">
    <div class="section-title">{$_('editor.card_image_foreground_transform')}</div>
    <div class="field-grid">
      <label class="field"><span>{$_('editor.card_image_foreground_x')}</span><input type="number" step="1" bind:value={form.foregroundX} /></label>
      <label class="field"><span>{$_('editor.card_image_foreground_y')}</span><input type="number" step="1" bind:value={form.foregroundY} /></label>
      <label class="field"><span>{$_('editor.card_image_foreground_scale')}</span><input type="number" min={MIN_FOREGROUND_SCALE} max={MAX_FOREGROUND_SCALE} step="0.01" bind:value={form.foregroundScale} /></label>
      <label class="field"><span>{$_('editor.card_image_foreground_rotation')}</span><input type="number" step="1" bind:value={form.foregroundRotation} /></label>
      <label class="field"><span>{$_('editor.card_image_foreground_width')}</span><input type="number" min="1" step="1" bind:value={form.foregroundWidth} /></label>
      <label class="field"><span>{$_('editor.card_image_foreground_height')}</span><input type="number" min="1" step="1" bind:value={form.foregroundHeight} /></label>
    </div>
  </div>

  <div class="drawer-section foreground-section">
    <div class="effect-block-header">
      <div class="section-title">{$_('editor.card_image_effect_block')}</div>
      <label class="toggle effect-block-toggle"><input type="checkbox" bind:checked={form.effectBlockEnabled} /><span>{$_('editor.card_image_effect_block_enable')}</span></label>
    </div>
    <fieldset class="effect-block-fieldset" disabled={!form.effectBlockEnabled}>
      <div class="field-grid">
        <label class="field"><span>{$_('editor.card_image_effect_block_opacity')}</span><input type="number" min="0" max="1" step="0.05" bind:value={form.effectBlockOpacity} /></label>
        <div class="field">
          <span>{$_('editor.card_image_effect_block_color')}</span>
          <div class="color-input-row color-input-row-compact">
            <input class="color-swatch" type="color" value={form.effectBlockColor || '#f6f2e8'} onchange={(event) => updateColorField('effectBlockColor', (event.currentTarget as HTMLInputElement).value)} />
            <input type="text" bind:value={form.effectBlockColor} />
          </div>
        </div>
      </div>
    </fieldset>
    <small class="field-hint">{$_('editor.card_image_effect_block_hint')}</small>
  </div>
{/if}

<style>
  .btn-sm { padding: 0.38rem 0.75rem; font-size: 0.84rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-secondary { background: rgba(148, 163, 184, 0.14); color: var(--text-primary); border: 1px solid rgba(148, 163, 184, 0.22); }
  .drawer-section { margin-bottom: 18px; padding: 14px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-base); }
  .foreground-section { margin-top: 12px; margin-bottom: 0; }
  .section-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .field-stack { margin-top: 12px; display: flex; flex-direction: column; gap: 12px; }
  .field-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .subfield-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; margin-top: 6px; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .field span { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }
  .field input, .field select, .field textarea { width: 100%; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 0.9rem; }
  .field textarea { resize: vertical; min-height: 110px; }
  .field-span-2, .field-color { grid-column: span 2; }
  .color-input-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .color-input-row-compact { grid-template-columns: 52px minmax(0, 1fr); }
  .color-swatch { min-height: 38px; padding: 4px; cursor: pointer; }
  .color-preset-group { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
  .color-preset-label { font-size: 0.78rem; color: var(--text-secondary); font-weight: 600; }
  .color-preset-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .color-preset-chip { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border-radius: 999px; border: 1px solid var(--border-color); background: var(--bg-surface); transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
  .color-preset-chip:hover { border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color)); transform: translateY(-1px); }
  .color-preset-chip.is-active { border-color: var(--accent-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 30%, transparent); }
  .color-preset-swatch { width: 18px; height: 18px; border-radius: 999px; flex: 0 0 auto; background: var(--preset-color); border: 1px solid color-mix(in srgb, #0f172a 18%, rgba(255, 255, 255, 0.28)); }
  .toggle-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .toggle { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-surface); color: var(--text-primary); font-size: 0.88rem; }
  .toggle input { width: auto; margin: 0; }
  .gradient-toggle { margin-top: 6px; align-self: flex-start; }
  .field-hint { font-size: 0.84rem; color: var(--text-secondary); }
  .effect-block-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .effect-block-toggle { margin-top: 0; }
  .effect-block-fieldset { margin: 0; padding: 0; border: none; min-width: 0; }
  .effect-block-fieldset:disabled { opacity: 0.58; }

  @media (max-width: 720px) {
    .field-grid,
    .toggle-grid,
    .subfield-grid {
      grid-template-columns: 1fr;
    }

    .field-span-2,
    .field-color {
      grid-column: span 1;
    }

    .color-input-row {
      grid-template-columns: 52px minmax(0, 1fr);
    }
  }
</style>
