<script lang="ts">
  import { _ } from 'svelte-i18n';
  import CardImageDrawer from '$lib/components/CardImageDrawer.svelte';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { activeTab } from '$lib/stores/db';
  import { editorState, getAllCardsMap } from '$lib/stores/editor.svelte';
  import type { CardDataEntry } from '$lib/types';
  import type { CardImageConfigDocument } from '$lib/features/card-image/layout';
  import {
    getCardImageDocument,
    setCardImageDocument,
    workspaceMetadataState,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import { getWorkspaceCardDraft } from '$lib/modules/card/workbench/cardDraftWorkspaceState.svelte';

  const selectedCard = $derived.by(() => {
    const draft = getWorkspaceCardDraft($activeTab?.id);
    return (draft?.lastSyncedSelectedId === editorState.selectedId ? draft?.draftCard : null)
      ?? getAllCardsMap().get(editorState.selectedId ?? -1) ?? null;
  });
  const imageDocumentKey = $derived(`surface-card-image:${$activeTab?.id ?? 'none'}:${selectedCard?.code ?? 'none'}`);
  const imageDocument = $derived.by(() => {
    workspaceMetadataState.metadata;
    return selectedCard && workspaceMetadataState.ready && workspaceMetadataState.cdbPath === $activeTab?.path
      ? getCardImageDocument(selectedCard.code) : null;
  });

  function persistImageDocument(document: CardImageConfigDocument, key: string) {
    if (!selectedCard || key !== imageDocumentKey || !workspaceMetadataState.ready || workspaceMetadataState.cdbPath !== $activeTab?.path) return;
    setCardImageDocument(selectedCard.code, {
      ...document,
      meta: {
        ...(document.meta ?? {}),
        cardCode: selectedCard.code,
        cardName: selectedCard.name ?? '',
      },
    });
  }

  async function reloadCardFromCdb(): Promise<CardDataEntry | null> {
    const documentId = $activeTab?.id;
    const cardCode = selectedCard?.code;
    if (!documentId || !cardCode) return null;
    return documentRuntime.query<CardDataEntry | null>(documentId, { kind: 'getById', cardId: cardCode });
  }
</script>

<section class="image-surface">
  {#if selectedCard}
    <div class="image-editor">
      {#key imageDocumentKey}
      <CardImageDrawer
        open
        mode="workbench"
        card={selectedCard}
        cdbPath={$activeTab?.path ?? ''}
        aiEnabled={false}
        documentKey={imageDocumentKey}
        initialDocument={imageDocument}
        onDocumentChange={persistImageDocument}
        onReloadFromCdb={reloadCardFromCdb}
      />
      {/key}
    </div>
  {:else}
    <div class="surface-empty">
      <div class="empty-card">
        <h2>{$_('surface.image_title')}</h2>
        <p>{$_('surface.image_hint')}</p>
        <div class="context-line">
          <span>{$_('surface.context_card')}</span>
          <strong>{$_('surface.context_none')}</strong>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .image-surface {
    height: 100%;
    min-width: 0;
    overflow: hidden;
    background: var(--bg-base);
    display: flex;
    flex-direction: column;
  }

  .image-editor {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .surface-empty {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .empty-card {
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius-soft);
    background: var(--bg-surface);
  }

  h2 {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-primary);
  }

  p {
    margin: 0;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .context-line {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
    color: var(--text-secondary);
  }

  .context-line strong {
    color: var(--text-primary);
    text-align: right;
  }
</style>
