<script lang="ts">
  import type { Component } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { documentRuntime } from '$lib/platform/appRuntime';
  import { documentState, getActiveDataDocument } from '$lib/platform/store.svelte';
  import { activeTabId } from '$lib/stores/db';
  import { CARD_COLLECTION_TYPE } from '$lib/modules/card';
  import { LUA_SCRIPT_TYPE } from '$lib/modules/lua';
  import { CARD_IMAGE_CONFIG_TYPE } from '$lib/modules/card-image/constants';
  import { AI_SESSION_TYPE } from '$lib/modules/ai/types';

  let loadedWorkbench = $state<{
    id: string;
    module: { default: Component };
  } | null>(null);
  let loadError = $state('');
  let loadSequence = 0;

  const TOOL_DOCUMENT_TYPES = new Set([
    LUA_SCRIPT_TYPE,
    CARD_IMAGE_CONFIG_TYPE,
    AI_SESSION_TYPE,
  ]);

  const activeDocument = $derived.by(() => {
    const document = getActiveDataDocument();
    if (!document || !TOOL_DOCUMENT_TYPES.has(document.typeId)) {
      return document;
    }

    return documentState.documents.find((item) => (
      item.id === $activeTabId && item.typeId === CARD_COLLECTION_TYPE
    )) ?? document;
  });
  const workbench = $derived(
    activeDocument
      ? documentRuntime.registry.findWorkbench(activeDocument.typeId)
      : null,
  );

  $effect(() => {
    documentState.activeDocumentId;
    const target = workbench;
    const sequence = ++loadSequence;
    if (!target) {
      loadedWorkbench = null;
      loadError = '';
      return;
    }
    if (loadedWorkbench?.id === target.id) {
      return;
    }

    loadError = '';
    void target.component()
      .then((module) => {
        if (sequence !== loadSequence || workbench?.id !== target.id) return;
        loadedWorkbench = {
          id: target.id,
          module: module as { default: Component },
        };
      })
      .catch((error) => {
        if (sequence !== loadSequence) return;
        loadError = error instanceof Error ? error.message : String(error);
      });
  });
</script>

{#if loadError}
  <div class="workbench-message">{loadError}</div>
{:else if loadedWorkbench}
  {@const Component = loadedWorkbench.module.default}
  <Component />
{:else}
  <div class="workbench-message">{$_('nav.open_or_create_document')}</div>
{/if}

<style>
  .workbench-message {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--text-secondary);
  }
</style>
