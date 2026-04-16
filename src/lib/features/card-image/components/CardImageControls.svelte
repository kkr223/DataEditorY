<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { HAS_AI_FEATURE, HAS_EXTRA_BUILD } from '$lib/config/build';

  let {
    mode,
    croppedImageDataUrl = '',
    hasForegroundImage = false,
    isTranslating = false,
    isSavingJpg = false,
    isDownloading = false,
    fileInput = $bindable<HTMLInputElement | null>(null),
    configFileInput = $bindable<HTMLInputElement | null>(null),
    foregroundFileInput = $bindable<HTMLInputElement | null>(null),
    onImageUpload = (_event: Event) => {},
    onConfigFileUpload = (_event: Event) => {},
    onForegroundImageUpload = (_event: Event) => {},
    onOpenFilePicker = () => {},
    onConfigImport = () => {},
    onConfigExport = () => {},
    onOpenForegroundEditor = () => {},
    onAiTranslate = () => {},
    onResetForegroundTransform = () => {},
    onClearForegroundImage = () => {},
    onSaveJpg = () => {},
    onDownload = () => {},
  }: {
    mode: 'toolbar' | 'preview-actions' | 'foreground-toolbar';
    croppedImageDataUrl?: string;
    hasForegroundImage?: boolean;
    isTranslating?: boolean;
    isSavingJpg?: boolean;
    isDownloading?: boolean;
    fileInput?: HTMLInputElement | null;
    configFileInput?: HTMLInputElement | null;
    foregroundFileInput?: HTMLInputElement | null;
    onImageUpload?: (event: Event) => void | Promise<void>;
    onConfigFileUpload?: (event: Event) => void | Promise<void>;
    onForegroundImageUpload?: (event: Event) => void | Promise<void>;
    onOpenFilePicker?: () => void;
    onConfigImport?: () => void | Promise<void>;
    onConfigExport?: () => void | Promise<void>;
    onOpenForegroundEditor?: () => void;
    onAiTranslate?: () => void | Promise<void>;
    onResetForegroundTransform?: () => void;
    onClearForegroundImage?: () => void;
    onSaveJpg?: () => void | Promise<void>;
    onDownload?: () => void | Promise<void>;
  } = $props();
</script>

{#if mode === 'toolbar'}
  <div class="form-toolbar">
    <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp" bind:this={fileInput} onchange={onImageUpload} />
    <input class="sr-only" type="file" accept="application/json,.json" bind:this={configFileInput} onchange={onConfigFileUpload} />
    {#if HAS_EXTRA_BUILD}
      <input class="sr-only" type="file" accept="image/png,image/webp" bind:this={foregroundFileInput} onchange={onForegroundImageUpload} />
    {/if}
    <button class="btn-primary btn-sm upload-btn" type="button" onclick={onOpenFilePicker}>
      {croppedImageDataUrl ? $_('editor.card_image_recrop') : $_('editor.card_image_upload')}
    </button>
    <button class="btn-secondary btn-sm" type="button" onclick={onConfigImport}>
      {$_('editor.card_image_config_import')}
    </button>
    <button class="btn-secondary btn-sm" type="button" onclick={onConfigExport}>
      {$_('editor.card_image_config_export')}
    </button>
    {#if HAS_EXTRA_BUILD}
      <button class="btn-secondary btn-sm" type="button" onclick={onOpenForegroundEditor}>
        {$_('editor.card_image_foreground_button')}
      </button>
    {/if}
    {#if HAS_AI_FEATURE}
      <button class="btn-secondary btn-sm" type="button" onclick={onAiTranslate} disabled={isTranslating}>
        {isTranslating ? $_('editor.ai_translating') : $_('editor.card_image_ai_translate')}
      </button>
    {/if}
    <span class="field-hint">
      {#if croppedImageDataUrl}
        {$_('editor.card_image_ready')}
      {:else}
        {$_('editor.card_image_upload_hint')}
      {/if}
    </span>
  </div>
{:else if mode === 'preview-actions'}
  <div class="preview-actions">
    <button class="btn-secondary btn-sm" type="button" onclick={onSaveJpg} disabled={isSavingJpg}>
      {isSavingJpg ? $_('editor.card_image_saving_jpg') : $_('editor.card_image_save_jpg')}
    </button>
    <button class="btn-secondary btn-sm" type="button" onclick={onDownload} disabled={isDownloading}>
      {isDownloading ? $_('editor.card_image_downloading') : $_('editor.card_image_download')}
    </button>
  </div>
{:else}
  <div class="foreground-toolbar">
    <button class="btn-primary btn-sm" type="button" onclick={onOpenFilePicker}>
      {hasForegroundImage ? $_('editor.card_image_foreground_replace') : $_('editor.card_image_foreground_upload')}
    </button>
    <button class="btn-secondary btn-sm" type="button" onclick={onResetForegroundTransform} disabled={!hasForegroundImage}>
      {$_('editor.card_image_foreground_reset')}
    </button>
    <button class="btn-secondary btn-sm" type="button" onclick={onClearForegroundImage} disabled={!hasForegroundImage}>
      {$_('editor.card_image_foreground_clear')}
    </button>
  </div>
{/if}

<style>
  .btn-sm { padding: 0.38rem 0.75rem; font-size: 0.84rem; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
  .btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28); }
  .btn-primary:hover { background: linear-gradient(135deg, #3b82f6, #2563eb); }
  .btn-secondary { background: rgba(148, 163, 184, 0.14); color: var(--text-primary); border: 1px solid rgba(148, 163, 184, 0.22); }
  .btn-secondary:hover { background: rgba(148, 163, 184, 0.22); }
  button:disabled { cursor: not-allowed; opacity: 0.6; }
  .form-toolbar, .foreground-toolbar, .preview-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .upload-btn { box-shadow: 0 10px 24px rgba(37, 99, 235, 0.34); padding-inline: 1rem; }
  .field-hint { font-size: 0.84rem; color: var(--text-secondary); }
  .preview-actions { justify-content: flex-end; }
  .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; border: 0; padding: 0; white-space: nowrap; clip-path: inset(50%); overflow: hidden; }
</style>
