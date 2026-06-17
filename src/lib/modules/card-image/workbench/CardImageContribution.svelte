<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { CardWorkbenchContext } from '$lib/modules/card/workbench/context';
  import { listenWorkbenchAction } from '$lib/platform';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
  import { tauriBridge } from '$lib/infrastructure/tauri';
  import {
    importCardImage,
    resolveCardImageSrc,
  } from '$lib/services/cardImageService';
  import { createCardImageFormData } from '$lib/features/card-image/layout';
  import {
    CARD_IMAGE_CONFIG_TYPE,
    CARD_IMAGE_PROVIDER_ID,
  } from '$lib/modules/card-image/constants';

  let { context }: { context: CardWorkbenchContext } = $props();

  const getCardCode = () => {
    const code = Number(context.draftCard.code ?? 0);
    return Number.isInteger(code) && code > 0 ? code : null;
  };

  const findExistingCardImageDocument = (code: number) => (
    documentRuntime.snapshot.documents.find((document) => (
      document.typeId === CARD_IMAGE_CONFIG_TYPE
      && document.references.some((reference) => (
        reference.relation === 'derived-from-card'
        && reference.documentId === context.activeDocumentId
        && Number(reference.metadata?.cardCode ?? 0) === code
      ))
    )) ?? null
  );

  const openCardImageWorkbench = async () => {
    const code = getCardCode();
    if (!code) return;

    const existing = findExistingCardImageDocument(code);
    if (existing) {
      documentRuntime.activate(existing.id);
      return;
    }

    await documentRuntime.createDocument({
      typeId: CARD_IMAGE_CONFIG_TYPE,
      providerId: CARD_IMAGE_PROVIDER_ID,
      title: `${code}-card-image.json`,
      initialData: {
        kind: 'dataeditory-card-image-config',
        version: 1,
        form: createCardImageFormData(context.draftCard),
        meta: {
          cardCode: code,
          cardName: context.draftCard.name || undefined,
        },
      },
      references: [{
        relation: 'derived-from-card',
        typeId: CARD_COLLECTION_TYPE,
        documentId: context.activeDocumentId ?? undefined,
        sourceUri: context.activeCdbPath ?? undefined,
        metadata: {
          cardCode: code,
          cardName: context.draftCard.name || undefined,
          cdbPath: context.activeCdbPath ?? undefined,
        },
      }],
      metadata: {
        cardCode: code,
      },
    });
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

  onMount(() => listenWorkbenchAction('card-image.pick', pickImage));
</script>

<button
  class="btn-secondary btn-sm image-button"
  type="button"
  onclick={() => { void openCardImageWorkbench(); }}
>
  {$_('editor.card_image_button')}
</button>

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
