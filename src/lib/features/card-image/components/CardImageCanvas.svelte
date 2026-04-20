<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { FOREGROUND_EDITOR_CARD_HEIGHT, FOREGROUND_EDITOR_CARD_WIDTH, type CropBox } from '$lib/features/card-image/controller';

  type CropStageMetrics = {
    stageWidth: number;
    stageHeight: number;
    imageWidth: number;
    imageHeight: number;
    imageOffsetX: number;
    imageOffsetY: number;
    renderWidth: number;
    renderHeight: number;
  };

  let {
    mode,
    previewShell = $bindable<HTMLDivElement | null>(null),
    previewHost = $bindable<HTMLDivElement | null>(null),
    foregroundPreviewShell = $bindable<HTMLDivElement | null>(null),
    foregroundPreviewHost = $bindable<HTMLDivElement | null>(null),
    cropBodyElement = $bindable<HTMLDivElement | null>(null),
    cropSidebarElement = $bindable<HTMLElement | null>(null),
    errorMessage = '',
    previewZoomPercent = 100,
    sourceImageUrl = '',
    cropRotation = 0,
    cropBox = { x: 0, y: 0, size: 0 } as CropBox,
    cropStageMetrics = {
      stageWidth: 0,
      stageHeight: 0,
      imageWidth: 0,
      imageHeight: 0,
      imageOffsetX: 0,
      imageOffsetY: 0,
      renderWidth: 0,
      renderHeight: 0,
    } as CropStageMetrics,
    foregroundEditorScale = 1,
    foregroundSelectionStyle = '',
    hasForegroundImage = false,
    onPreviewWheel = (_event: WheelEvent) => {},
    onAdjustPreviewZoom = (_delta: number) => {},
    onCropPointerDown = (_event: PointerEvent) => {},
    onCropPointerMove = (_event: PointerEvent) => {},
    onCropPointerUp = (_event: PointerEvent) => {},
    onCropWheel = (_event: WheelEvent) => {},
    onCropResizePointerDown = (_event: PointerEvent) => {},
    onRotateCropLeft = () => {},
    onRotateCropRight = () => {},
    onCropRotationInput = (_event: Event) => {},
    onCropRotationNumberInput = (_value: string) => {},
    onCropRotationNumberBlur = () => {},
    onResetCropRotation = () => {},
    onForegroundMovePointerDown = (_event: PointerEvent) => {},
    onForegroundRotatePointerDown = (_event: PointerEvent) => {},
    onForegroundScalePointerDown = (_event: PointerEvent) => {},
  }: {
    mode: 'preview' | 'foreground' | 'crop';
    previewShell?: HTMLDivElement | null;
    previewHost?: HTMLDivElement | null;
    foregroundPreviewShell?: HTMLDivElement | null;
    foregroundPreviewHost?: HTMLDivElement | null;
    cropBodyElement?: HTMLDivElement | null;
    cropSidebarElement?: HTMLElement | null;
    errorMessage?: string;
    previewZoomPercent?: number;
    sourceImageUrl?: string;
    cropRotation?: number;
    cropBox?: CropBox;
    cropStageMetrics?: CropStageMetrics;
    foregroundEditorScale?: number;
    foregroundSelectionStyle?: string;
    hasForegroundImage?: boolean;
    onPreviewWheel?: (event: WheelEvent) => void;
    onAdjustPreviewZoom?: (delta: number) => void;
    onCropPointerDown?: (event: PointerEvent) => void;
    onCropPointerMove?: (event: PointerEvent) => void;
    onCropPointerUp?: (event: PointerEvent) => void;
    onCropWheel?: (event: WheelEvent) => void;
    onCropResizePointerDown?: (event: PointerEvent) => void;
    onRotateCropLeft?: () => void;
    onRotateCropRight?: () => void;
    onCropRotationInput?: (event: Event) => void;
    onCropRotationNumberInput?: (value: string) => void;
    onCropRotationNumberBlur?: () => void;
    onResetCropRotation?: () => void;
    onForegroundMovePointerDown?: (event: PointerEvent) => void;
    onForegroundRotatePointerDown?: (event: PointerEvent) => void;
    onForegroundScalePointerDown?: (event: PointerEvent) => void;
  } = $props();

  let isEditingCropRotation = $state(false);
  let cropRotationDraft = $state('');

  function formatCropRotationValue(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  $effect(() => {
    if (isEditingCropRotation) return;
    cropRotationDraft = formatCropRotationValue(cropRotation);
  });
</script>

{#if mode === 'preview'}
  <div class="preview-zoom-toolbar">
    <button class="btn-secondary btn-sm" type="button" aria-label={$_('editor.card_image_zoom_out')} onclick={() => onAdjustPreviewZoom(-5)}>−</button>
    <span class="zoom-indicator">{previewZoomPercent}%</span>
    <button class="btn-secondary btn-sm" type="button" aria-label={$_('editor.card_image_zoom_in')} onclick={() => onAdjustPreviewZoom(5)}>+</button>
  </div>

  <div class="preview-card-shell" bind:this={previewShell} onwheel={onPreviewWheel}>
    <div class="preview-stage" bind:this={previewHost}></div>
  </div>

  {#if errorMessage}
    <div class="preview-error">{errorMessage}</div>
  {/if}
{:else if mode === 'foreground'}
  <div class="foreground-preview-shell" bind:this={foregroundPreviewShell}>
    <div class="foreground-preview-layout" style={`width:${FOREGROUND_EDITOR_CARD_WIDTH * foregroundEditorScale}px;height:${FOREGROUND_EDITOR_CARD_HEIGHT * foregroundEditorScale}px;`}>
      <div class="foreground-preview-canvas" style={`width:${FOREGROUND_EDITOR_CARD_WIDTH}px;height:${FOREGROUND_EDITOR_CARD_HEIGHT}px;transform:scale(${foregroundEditorScale});--foreground-handle-scale:${1 / Math.max(foregroundEditorScale, 0.01)};`}>
        <div class="preview-stage foreground-preview-stage" bind:this={foregroundPreviewHost}></div>
        {#if hasForegroundImage}
          <div role="presentation" class="foreground-selection" style={foregroundSelectionStyle} onpointerdown={onForegroundMovePointerDown}>
            <button class="foreground-handle foreground-handle-rotate" type="button" aria-label={$_('editor.card_image_foreground_rotate_handle')} onpointerdown={onForegroundRotatePointerDown}></button>
            <button class="foreground-handle foreground-handle-scale" type="button" aria-label={$_('editor.card_image_foreground_scale_handle')} onpointerdown={onForegroundScalePointerDown}></button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <div class="crop-body" bind:this={cropBodyElement}>
    {#if sourceImageUrl}
      <div class="crop-layout">
        <div class="crop-canvas-shell">
          <div class="crop-canvas" style={`width:${cropStageMetrics.stageWidth}px;height:${cropStageMetrics.stageHeight}px;`}>
            <div class="crop-image-frame" style={`left:${cropStageMetrics.imageOffsetX}px;top:${cropStageMetrics.imageOffsetY}px;width:${cropStageMetrics.imageWidth}px;height:${cropStageMetrics.imageHeight}px;transform:rotate(${cropRotation}deg);`}>
              <img src={sourceImageUrl} alt={$_('editor.card_image_crop_source_alt')} class="crop-image" />
            </div>
            {#if cropBox.size > 0}
              <div
                class="crop-box"
                role="presentation"
                style={`left:${cropBox.x}px;top:${cropBox.y}px;width:${cropBox.size}px;height:${cropBox.size}px;`}
                onpointerdown={onCropPointerDown}
                onpointermove={onCropPointerMove}
                onpointerup={onCropPointerUp}
                onpointercancel={onCropPointerUp}
                onwheel={onCropWheel}
              >
                <div class="crop-box-grid"></div>
                <button class="crop-resize-handle" type="button" aria-label={$_('editor.card_image_crop_resize')} onpointerdown={onCropResizePointerDown}></button>
              </div>
            {/if}
          </div>
        </div>

        <aside class="crop-sidebar" bind:this={cropSidebarElement}>
          <div class="crop-toolbar">
            <span class="crop-toolbar-label">{$_('editor.card_image_crop_rotation')}</span>
            <div class="crop-toolbar-grid">
              <button class="btn-secondary btn-sm" type="button" onclick={onRotateCropLeft}>{$_('editor.card_image_crop_rotate_left')}</button>
              <button class="btn-secondary btn-sm" type="button" onclick={onRotateCropRight}>{$_('editor.card_image_crop_rotate_right')}</button>
              <label class="crop-rotation-slider">
                <input type="range" min="-180" max="180" step="0.1" value={cropRotation} aria-label={$_('editor.card_image_crop_rotation')} oninput={onCropRotationInput} />
                <div class="crop-rotation-value">
                  <input
                    class="crop-rotation-number"
                    type="number"
                    min="-180"
                    max="180"
                    step="0.1"
                    value={cropRotationDraft}
                    aria-label={$_('editor.card_image_crop_rotation')}
                    onfocus={() => {
                      isEditingCropRotation = true;
                    }}
                    oninput={(event) => {
                      const value = (event.currentTarget as HTMLInputElement).value;
                      cropRotationDraft = value;
                      onCropRotationNumberInput(value);
                    }}
                    onblur={() => {
                      isEditingCropRotation = false;
                      onCropRotationNumberBlur();
                    }}
                  />
                  <span>°</span>
                </div>
              </label>
              <button class="btn-secondary btn-sm crop-reset-btn" type="button" onclick={onResetCropRotation}>{$_('editor.card_image_crop_reset')}</button>
            </div>
          </div>
        </aside>
      </div>
    {/if}
  </div>
{/if}

<style>
  .btn-sm { padding: 0.38rem 0.75rem; font-size: 0.84rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-secondary { background: rgba(148, 163, 184, 0.14); color: var(--text-primary); border: 1px solid rgba(148, 163, 184, 0.22); }
  .preview-zoom-toolbar { display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .zoom-indicator { min-width: 4rem; text-align: center; font-size: 0.84rem; font-weight: 700; color: var(--text-secondary); }
  .preview-card-shell { position: relative; flex: 1; min-height: clamp(620px, 74vh, 940px); border: 1px solid var(--border-color); border-radius: 12px; background: radial-gradient(circle at top, rgba(56, 189, 248, 0.12), transparent 35%), linear-gradient(180deg, rgba(15, 23, 42, 0.05), rgba(15, 23, 42, 0.02)); overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 16px 8px 24px; overscroll-behavior: contain; }
  .preview-stage { display: flex; justify-content: center; align-items: flex-start; min-width: 100%; min-height: 100%; }
  .preview-error { display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; font-size: 0.84rem; color: #dc2626; }
  .foreground-preview-shell { position: relative; flex: 1; min-height: min(72vh, 780px); border: 1px solid var(--border-color); border-radius: 14px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.01)); overflow: auto; display: flex; align-items: center; justify-content: center; padding: 18px; }
  .foreground-preview-layout { position: relative; flex: 0 0 auto; }
  .foreground-preview-canvas { position: relative; transform-origin: top left; }
  .foreground-preview-stage { position: absolute; inset: 0; min-width: 0; min-height: 0; display: block; }
  .foreground-selection { position: absolute; border: 3px solid rgba(37, 99, 235, 0.92); border-radius: 16px; background: rgba(37, 99, 235, 0.06); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.94) inset, 0 14px 30px rgba(37, 99, 235, 0.18); cursor: move; z-index: 4; touch-action: none; }
  .foreground-selection::before { content: ''; position: absolute; inset: 14px; border: 2px dashed rgba(255, 255, 255, 0.84); border-radius: 12px; }
  .foreground-handle { position: absolute; width: 28px; height: 28px; border-radius: 999px; border: 3px solid #eff6ff; background: #2563eb; padding: 0; box-shadow: 0 6px 16px rgba(15, 23, 42, 0.34); transform-origin: center; }
  .foreground-handle-rotate { left: 50%; top: -20px; transform: translate(-50%, -100%) scale(var(--foreground-handle-scale, 1)); cursor: grab; }
  .foreground-handle-scale { right: -16px; bottom: -16px; transform: scale(var(--foreground-handle-scale, 1)); cursor: nwse-resize; }
  .crop-body { padding: 18px; overflow: auto; }
  .crop-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; align-items: start; justify-content: center; gap: 18px; }
  .crop-canvas-shell { min-width: 0; display: flex; justify-content: center; }
  .crop-sidebar { display: flex; align-items: flex-start; }
  .crop-toolbar { display: grid; grid-template-columns: 1fr; gap: 10px; width: 100%; padding: 14px; border: 1px solid var(--border-color); border-radius: 12px; background: linear-gradient(180deg, rgba(15, 23, 42, 0.14), rgba(15, 23, 42, 0.06)); }
  .crop-toolbar-label { font-size: 0.82rem; color: var(--text-secondary); font-weight: 600; }
  .crop-toolbar-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: stretch; width: 100%; }
  .crop-rotation-slider { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 8px; min-width: 0; width: 100%; padding: 0.35rem 0.55rem; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-base); color: var(--text-primary); }
  .crop-rotation-slider input { width: 100%; min-width: 0; accent-color: #2563eb; }
  .crop-rotation-value { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
  .crop-rotation-number { width: 4.5rem !important; min-width: 4.5rem !important; text-align: right; font-variant-numeric: tabular-nums; }
  .crop-rotation-value span { min-width: auto; text-align: right; font-size: 0.82rem; font-variant-numeric: tabular-nums; }
  .crop-reset-btn { justify-self: stretch; }
  .crop-canvas { position: relative; flex: 0 0 auto; line-height: 0; border: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent); border-radius: 12px; background: linear-gradient(45deg, rgba(148, 163, 184, 0.08) 25%, transparent 25%, transparent 75%, rgba(148, 163, 184, 0.08) 75%), linear-gradient(45deg, rgba(148, 163, 184, 0.08) 25%, transparent 25%, transparent 75%, rgba(148, 163, 184, 0.08) 75%), rgba(15, 23, 42, 0.2); background-position: 0 0, 12px 12px, 0 0; background-size: 24px 24px, 24px 24px, auto; overflow: hidden; }
  .crop-image-frame { position: absolute; transform-origin: center; }
  .crop-image { display: block; width: 100%; height: 100%; user-select: none; pointer-events: none; }
  .crop-box { position: absolute; border: 2px solid #f8fafc; background: rgba(255, 255, 255, 0.08); box-shadow: 0 0 0 9999px rgba(2, 6, 12, 0.45), 0 0 0 1px rgba(15, 23, 42, 0.7) inset; cursor: move; touch-action: none; }
  .crop-box-grid { position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.35) 1px, transparent 1px); background-size: 33.333% 100%, 100% 33.333%; }
  .crop-resize-handle { position: absolute; right: -8px; bottom: -8px; width: 16px; height: 16px; border-radius: 999px; border: 2px solid #0f172a; background: #f8fafc; cursor: nwse-resize; padding: 0; }

  @media (max-width: 1280px), (max-height: 820px) {
    .preview-card-shell { min-height: clamp(480px, 68vh, 820px); }
  }

  @media (max-width: 980px) {
    .crop-layout { grid-template-columns: 1fr; }
    .crop-canvas-shell { justify-content: flex-start; }
    .crop-sidebar { width: 100%; }
    .crop-toolbar { min-width: 0; width: 100%; }
  }
</style>
