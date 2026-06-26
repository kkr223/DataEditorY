<script lang="ts">
  import { _ } from 'svelte-i18n';
  import CardImageDrawer from '$lib/components/CardImageDrawer.svelte';
  import { activeTab } from '$lib/stores/db';
  import { editorState, getAllCardsMap } from '$lib/stores/editor.svelte';
  import type { CardImageConfigDocument } from '$lib/features/card-image/layout';
  import {
    getCardImageDocument,
    setCardImageDocument,
    workspaceMetadataState,
  } from '$lib/modules/card/workbench/workspaceMetadataState.svelte';
  import { getWorkspaceCardDraftCard } from '$lib/modules/card/workbench/cardDraftWorkspaceState.svelte';

  const selectedCard = $derived.by(() => (
    getWorkspaceCardDraftCard($activeTab?.id)
      ?? getAllCardsMap().get(editorState.selectedId ?? -1)
      ?? null
  ));
  const imageDocument = $derived.by(() => {
    workspaceMetadataState.metadata;
    return selectedCard ? getCardImageDocument(selectedCard.code) : null;
  });

  function persistImageDocument(document: CardImageConfigDocument) {
    if (!selectedCard) return;
    setCardImageDocument(selectedCard.code, {
      ...document,
      meta: {
        ...(document.meta ?? {}),
        cardCode: selectedCard.code,
        cardName: selectedCard.name ?? '',
      },
    });
  }
</script>

<section class="image-surface">
  {#if selectedCard}
    <div class="image-editor">
      <CardImageDrawer
        open
        mode="workbench"
        card={selectedCard}
        cdbPath={$activeTab?.path ?? ''}
        aiEnabled={false}
        documentKey={`surface-card-image:${$activeTab?.id ?? 'none'}:${selectedCard.code}`}
        initialDocument={imageDocument}
        onDocumentChange={persistImageDocument}
      />
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
    font-size: 1.05rem;
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
