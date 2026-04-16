import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { invokeCommand } from '$lib/infrastructure/tauri';
import { cloneCard } from './cardUtils';
import { clearSourceFilterCacheForTab, refreshCachedSearchForTab } from './search';
import { tabs, activeTab, markTabDirty, markActiveTabDirty } from './tabs';
import { pushUndoOperation } from './undo';

function syncCachedCardsInTab(tabId: string, cards: CardDataEntry[]) {
  if (cards.length === 0) return;

  const nextByCode = new Map(cards.map((card) => [card.code, cloneCard(card)]));
  tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            cachedCards: tab.cachedCards.map((cachedCard) => nextByCode.get(cachedCard.code) ?? cachedCard),
          }
        : tab
    )
  );
}

export async function getCardById(cardId: number): Promise<CardDataEntry | undefined> {
  const tab = get(activeTab);
  if (!tab) return undefined;
  return getCardByIdInTab(tab.id, cardId);
}

export async function getCardByIdInTab(tabId: string, cardId: number): Promise<CardDataEntry | undefined> {
  try {
    return await invokeCommand<CardDataEntry | null>('get_card_by_id', { tabId, cardId }) ?? undefined;
  } catch (err) {
    console.error('Failed to fetch card by id:', err);
    return undefined;
  }
}

export async function getCardsByIdsInTab(tabId: string, cardIds: number[]): Promise<CardDataEntry[]> {
  const safeIds = [...new Set(cardIds.filter((cardId) => Number.isInteger(cardId) && cardId > 0))];
  if (safeIds.length === 0) {
    return [];
  }

  try {
    return await invokeCommand<CardDataEntry[]>('get_cards_by_ids', {
      request: {
        tabId,
        cardIds: safeIds,
      },
    });
  } catch (err) {
    console.error('Failed to fetch cards by ids:', err);
    return [];
  }
}

export async function getCardsByIds(cardIds: number[]): Promise<CardDataEntry[]> {
  const tab = get(activeTab);
  if (!tab) return [];
  return getCardsByIdsInTab(tab.id, cardIds);
}

export async function modifyCard(card: CardDataEntry): Promise<boolean> {
  return modifyCards([card]);
}

export async function modifyCardsInTab(tabId: string, cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    const previousCardsByCode = new Map(
      (await getCardsByIdsInTab(tab.id, cards.map((card) => card.code)))
        .map((card) => [card.code, card] as const),
    );
    await invokeCommand('modify_cards', {
      request: {
        tabId: tab.id,
        cards: cards.map((card) => cloneCard(card)),
      },
    });
    pushUndoOperation(tab.id, {
      kind: 'modify',
      label: cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
      affectedIds: cards.map((card) => card.code),
      previousCards: cards.map((card) => previousCardsByCode.get(card.code) ?? null),
    });
    clearSourceFilterCacheForTab(tab.id);
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards:', err);
    return false;
  }
}

export async function modifyCardsWithSnapshotInTab(
  tabId: string,
  cards: CardDataEntry[],
  previousCards: Array<CardDataEntry | null | undefined>,
): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await invokeCommand('modify_cards', {
      request: {
        tabId: tab.id,
        cards: cards.map((card) => cloneCard(card)),
      },
    });
    pushUndoOperation(tab.id, {
      kind: 'modify',
      label: cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
      affectedIds: cards.map((card) => card.code),
      previousCards: cards.map((card, index) => {
        const previous = previousCards[index];
        return previous && previous.code === card.code ? cloneCard(previous) : null;
      }),
    });
    clearSourceFilterCacheForTab(tab.id);
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to modify cards with snapshots:', err);
    return false;
  }
}

export async function modifyCards(cards: CardDataEntry[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;
  return modifyCardsInTab(tab.id, cards);
}

export async function deleteCard(cardId: number): Promise<boolean> {
  return deleteCards([cardId]);
}

export async function deleteCards(cardIds: number[]): Promise<boolean> {
  const tab = get(activeTab);
  if (!tab) return false;

  try {
    const deletedCards = (await getCardsByIdsInTab(tab.id, cardIds)).map((card) => cloneCard(card));

    await invokeCommand('delete_cards', {
      request: {
        tabId: tab.id,
        cardIds,
      },
    });

    if (deletedCards.length > 0) {
      pushUndoOperation(tab.id, {
        kind: 'delete',
        label: deletedCards.length === 1 ? `Delete card ${deletedCards[0].code}` : `Delete ${deletedCards.length} cards`,
        affectedIds: deletedCards.map((card) => card.code),
        deletedCards,
      });
    }
    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
    markActiveTabDirty(true);
    return true;
  } catch (err) {
    console.error('Failed to delete cards:', err);
    return false;
  }
}

export async function deleteCardsWithSnapshotInTab(
  tabId: string,
  cardIds: number[],
  deletedCards: CardDataEntry[],
): Promise<boolean> {
  const tab = get(tabs).find((item) => item.id === tabId);
  if (!tab) return false;

  try {
    await invokeCommand('delete_cards', {
      request: {
        tabId: tab.id,
        cardIds,
      },
    });

    if (deletedCards.length > 0) {
      pushUndoOperation(tab.id, {
        kind: 'delete',
        label: deletedCards.length === 1 ? `Delete card ${deletedCards[0].code}` : `Delete ${deletedCards.length} cards`,
        affectedIds: deletedCards.map((card) => card.code),
        deletedCards: deletedCards.map((card) => cloneCard(card)),
      });
    }
    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
    markTabDirty(tab.id, true);
    return true;
  } catch (err) {
    console.error('Failed to delete cards with snapshots:', err);
    return false;
  }
}

export async function queryCardsRaw(tabId: string, queryClause: string, params: Record<string, string | number> = {}): Promise<CardDataEntry[]> {
  try {
    return await invokeCommand<CardDataEntry[]>('query_cards_raw', {
      request: {
        tabId,
        queryClause,
        params,
      },
    });
  } catch (err) {
    console.error('Failed to query cards:', err);
    return [];
  }
}
