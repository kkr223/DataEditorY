import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { documentRuntime } from '$lib/platform/appRuntime';
import type {
  CardCollectionCommand,
  CardCollectionQuery,
} from '$lib/modules/card';
import { cloneCard } from './cardUtils';
import { clearSourceFilterCacheForTab, refreshCachedSearchForTab } from './search';
import { tabs, activeTab, recordUndoLabel } from './tabs';

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
    return await documentRuntime.query<CardDataEntry | null>(
      tabId,
      { kind: 'getById', cardId } satisfies CardCollectionQuery,
    ) ?? undefined;
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
    return await documentRuntime.query<CardDataEntry[]>(
      tabId,
      { kind: 'getByIds', cardIds: safeIds } satisfies CardCollectionQuery,
    );
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
    await documentRuntime.execute(
      tab.id,
      {
        kind: 'upsert',
        cards: cards.map((card) => cloneCard(card)),
      } satisfies CardCollectionCommand,
    );
    recordUndoLabel(
      tab.id,
      cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
    );
    clearSourceFilterCacheForTab(tab.id);
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
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
    await documentRuntime.execute(
      tab.id,
      {
        kind: 'upsert',
        cards: cards.map((card) => cloneCard(card)),
      } satisfies CardCollectionCommand,
    );
    recordUndoLabel(
      tab.id,
      cards.length === 1 ? `Edit card ${cards[0].code}` : `Modify ${cards.length} cards`,
    );
    void previousCards;
    clearSourceFilterCacheForTab(tab.id);
    const refreshed = await refreshCachedSearchForTab(tab.id);
    if (!refreshed) {
      syncCachedCardsInTab(tab.id, cards);
    }
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
    await documentRuntime.execute(
      tab.id,
      { kind: 'delete', cardIds } satisfies CardCollectionCommand,
    );
    recordUndoLabel(
      tab.id,
      cardIds.length === 1 ? `Delete card ${cardIds[0]}` : `Delete ${cardIds.length} cards`,
    );
    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
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
    await documentRuntime.execute(
      tab.id,
      { kind: 'delete', cardIds } satisfies CardCollectionCommand,
    );
    recordUndoLabel(
      tab.id,
      deletedCards.length === 1
        ? `Delete card ${deletedCards[0].code}`
        : `Delete ${deletedCards.length} cards`,
    );
    clearSourceFilterCacheForTab(tab.id);
    await refreshCachedSearchForTab(tab.id);
    return true;
  } catch (err) {
    console.error('Failed to delete cards with snapshots:', err);
    return false;
  }
}
