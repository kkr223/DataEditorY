<script lang="ts">
  import { _ } from 'svelte-i18n';
  import CardImageDrawer from '$lib/components/CardImageDrawer.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { documentState, getActiveDataDocument } from '$lib/platform/store.svelte';
  import type { CardDataEntry } from '$lib/types';
  import {
    normalizeCardImageFormData,
    type CardImageConfigDocument,
  } from '$lib/features/card-image/layout';
  import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';

  const EMPTY_CARD: CardDataEntry = {
    code: 0,
    alias: 0,
    setcode: [],
    type: 0,
    attack: 0,
    defense: 0,
    level: 0,
    race: 0,
    attribute: 0,
    category: 0,
    ot: 0,
    name: '',
    desc: '',
    strings: [],
    lscale: 0,
    rscale: 0,
    linkMarker: 0,
    ruleCode: 0,
  };

  let documentData = $state<CardImageConfigDocument | null>(null);
  let loadError = $state('');
  let lastLoadedKey = '';
  let saveSequence = 0;

  const activeDocument = $derived(getActiveDataDocument());
  const activeDocumentKey = $derived(activeDocument?.id ?? '');

  const cdbPath = $derived.by(() => {
    const ref = activeDocument?.references.find((item) => item.relation === 'derived-from-card');
    const metadataPath = ref?.metadata?.cdbPath;
    if (typeof metadataPath === 'string' && metadataPath.trim()) {
      return metadataPath;
    }
    return typeof ref?.sourceUri === 'string' ? ref.sourceUri : '';
  });

  const card = $derived.by<CardDataEntry>(() => {
    const form = normalizeCardImageFormData(documentData?.form ?? {});
    const meta = documentData?.meta ?? {};
    const ref = activeDocument?.references.find((item) => item.relation === 'derived-from-card');
    const refCode = Number(ref?.metadata?.cardCode ?? 0);
    const code = Number(form.password || meta.cardCode || refCode || 0);
    const name = form.name || meta.cardName || String(ref?.metadata?.cardName ?? '');
    return {
      ...EMPTY_CARD,
      code: Number.isFinite(code) ? code : 0,
      name,
      desc: form.description,
    };
  });

  const normalizeDocument = (value: unknown): CardImageConfigDocument => {
    const input = value && typeof value === 'object'
      ? value as Partial<CardImageConfigDocument>
      : {};
    const meta = input.meta && typeof input.meta === 'object'
      ? input.meta
      : undefined;
    return {
      kind: 'dataeditory-card-image-config',
      version: 1,
      form: normalizeCardImageFormData(input.form ?? {}),
      exportScalePercent: input.exportScalePercent,
      meta: meta
        ? {
            cardCode: Number.isFinite(Number(meta.cardCode)) ? Number(meta.cardCode) : undefined,
            cardName: typeof meta.cardName === 'string' && meta.cardName.trim()
              ? meta.cardName
              : undefined,
            exportedAt: typeof meta.exportedAt === 'string' ? meta.exportedAt : undefined,
          }
        : undefined,
    };
  };

  const persistDocument = (document: CardImageConfigDocument) => {
    if (!activeDocument || activeDocument.typeId !== CARD_IMAGE_CONFIG_TYPE) return;
    const nextDocument = normalizeDocument(document);
    documentData = nextDocument;
    const documentId = activeDocument.id;
    const sequence = ++saveSequence;
    void documentRuntime.execute(documentId, {
      kind: 'replace',
      value: nextDocument,
    }).catch((error) => {
      if (sequence !== saveSequence) return;
      loadError = error instanceof Error ? error.message : String(error);
    });
  };

  const handleSavedJpg = async () => {};

  $effect(() => {
    documentState.activeDocumentId;
    documentState.documents;
    const document = activeDocument;
    if (!document || document.typeId !== CARD_IMAGE_CONFIG_TYPE) {
      documentData = null;
      loadError = '';
      lastLoadedKey = '';
      return;
    }

    const key = document.id;
    if (key === lastLoadedKey) return;
    lastLoadedKey = key;
    loadError = '';
    void documentRuntime.query(document.id, {})
      .then((value) => {
        documentData = normalizeDocument(value);
      })
      .catch((error) => {
        loadError = error instanceof Error ? error.message : String(error);
      });
  });
</script>

{#if loadError}
  <div class="workbench-message">{loadError}</div>
{:else if !activeDocument || activeDocument.typeId !== CARD_IMAGE_CONFIG_TYPE}
  <div class="workbench-message">{$_('editor.card_image_title')}</div>
{:else if documentData}
  <CardImageDrawer
    open
    mode="workbench"
    {card}
    {cdbPath}
    aiEnabled={false}
    documentKey={activeDocumentKey}
    initialDocument={documentData}
    onDocumentChange={persistDocument}
    onSavedJpg={handleSavedJpg}
  />
{:else}
  <div class="workbench-message">Loading...</div>
{/if}

<style>
  .workbench-message {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-secondary);
    background: var(--bg-base);
  }
</style>
