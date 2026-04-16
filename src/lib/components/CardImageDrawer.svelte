<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { disableAutofill } from '$lib/actions/disableAutofill';
  import type { CardDataEntry } from '$lib/types';
  import { HAS_EXTRA_BUILD } from '$lib/config/build';
  import {
    createCardImageController,
    NAME_COLOR_PRESETS,
  } from '$lib/features/card-image/controller';
  import CardImageCanvas from '$lib/features/card-image/components/CardImageCanvas.svelte';
  import CardImageControls from '$lib/features/card-image/components/CardImageControls.svelte';
  import CardImageFieldEditor from '$lib/features/card-image/components/CardImageFieldEditor.svelte';

  let {
    open = false,
    card,
    cdbPath = '',
    onSavedJpg = async () => {},
    onClose = () => {},
  }: {
    open?: boolean;
    card: CardDataEntry;
    cdbPath?: string;
    onSavedJpg?: () => void | Promise<void>;
    onClose?: () => void;
  } = $props();

  const controller = createCardImageController({
    open: () => open,
    card: () => card,
    cdbPath: () => cdbPath,
    onSavedJpg: () => onSavedJpg(),
    onClose: () => onClose(),
  });
</script>

<svelte:window onresize={controller.handleCropViewportResize} />

{#if open}
  <div class="drawer-backdrop" role="presentation" onclick={controller.handleBackdropClick}>
    <div class="drawer-panel" use:disableAutofill role="dialog" aria-modal="true" aria-label={$_('editor.card_image_title')}>
      <div class="drawer-header">
        <div>
          <h3>{$_('editor.card_image_title')}</h3>
          <p>{$_('editor.card_image_description')}</p>
        </div>
        <button class="close-btn" type="button" onclick={controller.closeDrawer}>×</button>
      </div>

      <div class="drawer-body">
        <div class="form-pane">
          <CardImageControls
            mode="toolbar"
            bind:fileInput={controller.state.fileInput}
            bind:configFileInput={controller.state.configFileInput}
            bind:foregroundFileInput={controller.state.foregroundFileInput}
            croppedImageDataUrl={controller.state.croppedImageDataUrl}
            isTranslating={controller.state.isTranslating}
            onImageUpload={controller.handleImageUpload}
            onConfigFileUpload={controller.handleConfigFileUpload}
            onForegroundImageUpload={controller.handleForegroundImageUpload}
            onOpenFilePicker={controller.openFilePicker}
            onConfigImport={controller.handleConfigImport}
            onConfigExport={controller.handleConfigExport}
            onOpenForegroundEditor={controller.openForegroundEditor}
            onAiTranslate={controller.handleAiTranslate}
          />

          <CardImageFieldEditor
            variant="main"
            bind:form={controller.state.form}
            bind:exportScalePercent={controller.state.exportScalePercent}
            nameColorPresets={NAME_COLOR_PRESETS}
            getOptionLabel={controller.getOptionLabel}
            onClearCustomNameColor={controller.clearCustomNameColor}
            onApplyNameColorPreset={controller.applyNameColorPreset}
            isNameColorPresetActive={controller.isNameColorPresetActive}
            onClearCustomNameShadowColor={controller.clearCustomNameShadowColor}
            onApplyNameShadowColorPreset={controller.applyNameShadowColorPreset}
            isNameShadowColorPresetActive={controller.isNameShadowColorPresetActive}
          />
        </div>

        <div class="preview-pane">
          <div class="preview-header">
            <div>
              <div class="section-title">{$_('editor.card_image_preview')}</div>
              <p>{$_('editor.card_image_preview_hint')}</p>
            </div>
            <CardImageControls
              mode="preview-actions"
              isSavingJpg={controller.state.isSavingJpg}
              isDownloading={controller.state.isDownloading}
              onSaveJpg={controller.handleSaveJpg}
              onDownload={controller.handleDownload}
            />
          </div>

          <CardImageCanvas
            mode="preview"
            bind:previewShell={controller.state.previewShell}
            bind:previewHost={controller.state.previewHost}
            previewZoomPercent={controller.state.previewZoomPercent}
            errorMessage={controller.state.errorMessage}
            onPreviewWheel={controller.handlePreviewWheel}
            onAdjustPreviewZoom={controller.adjustPreviewZoom}
          />
        </div>
      </div>

      <div class="drawer-footer">
        <span class="field-hint">{$_('editor.card_image_live_preview')}</span>
        <button class="btn-primary btn-sm" type="button" onclick={controller.closeDrawer}>{$_('editor.card_image_done')}</button>
      </div>
    </div>
  </div>
{/if}

{#if HAS_EXTRA_BUILD && controller.state.foregroundEditorOpen}
  <div class="foreground-backdrop" role="presentation" onclick={controller.handleForegroundBackdropClick}>
    <div class="foreground-dialog" role="dialog" aria-modal="true" aria-label={$_('editor.card_image_foreground_title')}>
      <div class="foreground-header">
        <div>
          <h4>{$_('editor.card_image_foreground_title')}</h4>
          <p>{$_('editor.card_image_foreground_description')}</p>
        </div>
        <button class="close-btn" type="button" onclick={controller.closeForegroundEditor}>×</button>
      </div>

      <div class="foreground-body">
        <section class="foreground-form">
          <CardImageControls
            mode="foreground-toolbar"
            hasForegroundImage={controller.hasForegroundImage()}
            onOpenFilePicker={controller.openForegroundFilePicker}
            onResetForegroundTransform={controller.resetForegroundTransform}
            onClearForegroundImage={controller.clearForegroundImage}
          />

          <CardImageFieldEditor
            variant="foreground"
            bind:form={controller.state.form}
            hasForegroundImage={controller.hasForegroundImage()}
          />
        </section>

        <section class="foreground-preview-pane">
          <div class="section-title">{$_('editor.card_image_foreground_preview')}</div>
          <p>{$_('editor.card_image_foreground_preview_hint')}</p>
          <CardImageCanvas
            mode="foreground"
            bind:foregroundPreviewShell={controller.state.foregroundPreviewShell}
            bind:foregroundPreviewHost={controller.state.foregroundPreviewHost}
            foregroundEditorScale={controller.getForegroundEditorScale()}
            foregroundSelectionStyle={controller.getForegroundSelectionStyle()}
            hasForegroundImage={controller.hasForegroundImage()}
            onForegroundMovePointerDown={controller.handleForegroundMovePointerDown}
            onForegroundRotatePointerDown={controller.handleForegroundRotatePointerDown}
            onForegroundScalePointerDown={controller.handleForegroundScalePointerDown}
          />
        </section>
      </div>
    </div>
  </div>
{/if}

{#if controller.state.cropModalOpen}
  <div class="crop-backdrop" role="presentation">
    <div class="crop-dialog" role="dialog" aria-modal="true" aria-label={$_('editor.card_image_crop_title')}>
      <div class="crop-header">
        <div>
          <h4>{$_('editor.card_image_crop_title')}</h4>
          <p>{$_('editor.card_image_crop_hint')}</p>
        </div>
      </div>

      <CardImageCanvas
        mode="crop"
        bind:cropBodyElement={controller.state.cropBodyElement}
        bind:cropSidebarElement={controller.state.cropSidebarElement}
        sourceImageUrl={controller.state.sourceImageUrl}
        cropRotation={controller.state.cropRotation}
        cropBox={controller.state.cropBox}
        cropStageMetrics={controller.getCropStageMetrics()}
        onCropPointerDown={controller.handleCropPointerDown}
        onCropPointerMove={controller.handleCropPointerMove}
        onCropPointerUp={controller.handleCropPointerUp}
        onCropWheel={controller.handleCropWheel}
        onCropResizePointerDown={controller.handleCropResizePointerDown}
        onRotateCropLeft={() => controller.rotateCropPreview(-90)}
        onRotateCropRight={() => controller.rotateCropPreview(90)}
        onCropRotationInput={controller.handleCropRotationInput}
        onResetCropRotation={controller.resetCropRotation}
      />

      <div class="crop-footer">
        <button class="btn-secondary btn-sm" type="button" onclick={controller.cancelCrop}>{$_('editor.card_image_crop_cancel')}</button>
        <button class="btn-primary btn-sm" type="button" onclick={controller.applyCrop}>{$_('editor.card_image_crop_apply')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .btn-sm { padding: 0.38rem 0.75rem; font-size: 0.84rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28); }
  .btn-secondary { background: rgba(148, 163, 184, 0.14); color: var(--text-primary); border: 1px solid rgba(148, 163, 184, 0.22); }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 1200; display: flex; justify-content: flex-end; background: rgba(9, 15, 24, 0.45); backdrop-filter: blur(2px); }
  .drawer-panel { width: min(1320px, 90vw); height: 100vh; background: var(--bg-surface); border-left: 1px solid var(--border-color); box-shadow: -20px 0 40px rgba(0, 0, 0, 0.2); display: flex; flex-direction: column; }
  .drawer-header, .drawer-footer { padding: 14px 18px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .drawer-footer { border-bottom: none; border-top: 1px solid var(--border-color); }
  .drawer-header h3, .section-title, .crop-header h4 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .drawer-header p, .preview-header p, .field-hint, .crop-header p { font-size: 0.84rem; color: var(--text-secondary); }
  .close-btn { width: 32px; height: 32px; padding: 0; font-size: 1.4rem; line-height: 1; border-radius: 999px; background: var(--bg-surface-active); color: var(--text-primary); }
  .drawer-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(480px, 1.08fr) minmax(460px, 1fr); }
  .form-pane, .preview-pane { min-height: 0; overflow-y: auto; padding: 18px; }
  .preview-pane { border-left: 1px solid var(--border-color); background: radial-gradient(circle at top, rgba(56, 189, 248, 0.08), transparent 30%), var(--bg-base); display: flex; flex-direction: column; gap: 12px; }
  .preview-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .foreground-backdrop { position: fixed; inset: 0; z-index: 1300; background: rgba(2, 6, 12, 0.62); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .foreground-dialog { width: min(1240px, 94vw); max-height: 92vh; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 28px 60px rgba(2, 6, 23, 0.32); }
  .foreground-header { padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .foreground-header h4 { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
  .foreground-header p, .foreground-preview-pane p { font-size: 0.84rem; color: var(--text-secondary); }
  .foreground-body { min-height: 0; display: grid; grid-template-columns: minmax(320px, 0.8fr) minmax(460px, 1fr); }
  .foreground-form, .foreground-preview-pane { min-height: 0; overflow-y: auto; padding: 18px; }
  .foreground-form { background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), transparent 24%); }
  .foreground-preview-pane { border-left: 1px solid var(--border-color); background: radial-gradient(circle at top, rgba(59, 130, 246, 0.08), transparent 36%), var(--bg-base); display: flex; flex-direction: column; gap: 10px; }
  .crop-backdrop { position: fixed; inset: 0; z-index: 1200; background: rgba(2, 6, 12, 0.7); display: flex; align-items: center; justify-content: center; padding: 24px; }
  .crop-dialog { width: min(980px, 96vw); max-height: 92vh; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
  .crop-header, .crop-footer { padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
  .crop-header { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
  .crop-footer { border-bottom: none; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; }

  @media (max-width: 1280px), (max-height: 820px) {
    .drawer-panel { width: min(1240px, 92vw); height: 100vh; }
    .drawer-body { grid-template-columns: minmax(430px, 0.98fr) minmax(400px, 1fr); }
    .form-pane, .preview-pane { padding: 16px; }
  }

  @media (max-width: 980px) {
    .drawer-body,
    .foreground-body { grid-template-columns: 1fr; }
    .preview-pane { border-left: none; border-top: 1px solid var(--border-color); }
    .foreground-preview-pane { border-left: none; border-top: 1px solid var(--border-color); }
  }

  @media (max-width: 720px) {
    .foreground-dialog { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; }
    .foreground-backdrop { padding: 0; }
  }
</style>
