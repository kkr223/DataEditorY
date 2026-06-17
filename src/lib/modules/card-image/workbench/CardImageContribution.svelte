<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { CardWorkbenchContext } from '$lib/modules/card/workbench/context';
  import { listenWorkbenchAction } from '$lib/platform';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import {
    importCardImage,
    resolveCardImageSrc,
  } from '$lib/services/cardImageService';
  import CardImageDrawerHost from '$lib/features/card-editor/components/CardImageDrawerHost.svelte';

  let { context }: { context: CardWorkbenchContext } = $props();
  let drawerOpen = $state(false);
  const aiEnabled = documentRuntime.registry.modules.has('ai');

  const getCardCode = () => {
    const code = Number(context.draftCard.code ?? 0);
    return Number.isInteger(code) && code > 0 ? code : null;
  };

  const pickImage = async () => {
    const code = getCardCode();
    if (!context.activeCdbPath || !code) return;
    const selected = await tauriBridge.open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }],
    });
    if (!selected || typeof selected !== 'string') return;
    await importCardImage({
      cdbPath: context.activeCdbPath,
      cardCode: code,
      sourcePath: selected,
    });
    context.setImageSrc(
      await resolveCardImageSrc(context.activeCdbPath, code, true),
    );
  };

  const handleSaved = async () => {
    const code = getCardCode();
    if (code) await context.refreshDraftImage(code, true);
  };

  onMount(() => listenWorkbenchAction('card-image.pick', pickImage));
</script>

<button
  class="btn-secondary btn-sm image-button"
  type="button"
  onclick={() => { drawerOpen = true; }}
>
  {$_('editor.card_image_button')}
</button>

<CardImageDrawerHost
  open={drawerOpen}
  card={context.draftCard}
  cdbPath={context.activeCdbPath ?? ''}
  {aiEnabled}
  onSavedJpg={handleSaved}
  onClose={() => { drawerOpen = false; }}
/>

<style>
  button {
    border: none;
    cursor: pointer;
  }

  .btn-sm {
    padding: 0.25rem 0.6rem;
    border-radius: var(--control-radius);
    font-size: 0.84rem;
    font-weight: 600;
  }

  .btn-secondary {
    color: var(--text-primary);
    background: var(--bg-surface-active);
  }

  .image-button {
    background: var(--feature-image-bg);
    box-shadow: inset 0 0 0 1px var(--feature-image-border);
  }
</style>
