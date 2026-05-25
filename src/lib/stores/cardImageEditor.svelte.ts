import { derived, get, writable } from 'svelte/store';
import type {
  CardDataEntry,
  CardImageWorkspaceSnapshot,
  CardImageWorkspaceState,
} from '$lib/types';
import { activateCardImageView, activateEditorView } from '$lib/stores/appShell.svelte';
import { activeTabId, tabs } from '$lib/stores/db';
import { cloneCard } from './cardUtils';

export const cardImageTabs = writable<CardImageWorkspaceState[]>([]);
export const activeCardImageTabId = writable<string | null>(null);

export const activeCardImageTab = derived(
  [cardImageTabs, activeCardImageTabId],
  ([$tabs, $activeId]) => $tabs.find((tab) => tab.id === $activeId) ?? null,
);

const isPositiveCardCode = (value: number) => Number.isFinite(value) && value > 0;

function getCardImageKey(cdbPath: string, cardCode: number) {
  return `${cdbPath}::${cardCode}`;
}

function findSourceTabId(cdbPath: string) {
  return get(tabs).find((tab) => tab.path === cdbPath)?.id ?? null;
}

function getCardImageTabByKey(cdbPath: string, cardCode: number) {
  if (!isPositiveCardCode(cardCode)) return null;

  const key = getCardImageKey(cdbPath, cardCode);
  return get(cardImageTabs).find((tab) => getCardImageKey(tab.cdbPath, tab.cardCode) === key) ?? null;
}

export function activateCardImageTab(tabId: string) {
  const tab = get(cardImageTabs).find((item) => item.id === tabId);
  if (!tab) return;

  activeCardImageTabId.set(tabId);
  const sourceTabId = tab.sourceTabId ?? findSourceTabId(tab.cdbPath);
  if (sourceTabId) {
    activeTabId.set(sourceTabId);
  }
  activateCardImageView();
}

export function openOrActivateCardImageTab(input: {
  cdbPath: string;
  sourceTabId: string | null;
  card: CardDataEntry;
}) {
  const cdbPath = input.cdbPath.trim();
  if (!cdbPath) return null;

  const cardCode = Number(input.card.code ?? 0);
  const existing = getCardImageTabByKey(cdbPath, cardCode);
  if (existing) {
    activateCardImageTab(existing.id);
    return existing.id;
  }

  const card = cloneCard(input.card);
  const nextTab: CardImageWorkspaceState = {
    id: crypto.randomUUID(),
    cdbPath,
    sourceTabId: input.sourceTabId,
    cardCode,
    cardName: card.name,
    card,
    snapshot: null,
  };

  cardImageTabs.update((currentTabs) => [...currentTabs, nextTab]);
  activeCardImageTabId.set(nextTab.id);
  activateCardImageView();
  return nextTab.id;
}

export function updateCardImageTabSnapshot(tabId: string, snapshot: CardImageWorkspaceSnapshot) {
  cardImageTabs.update((currentTabs) =>
    currentTabs.map((tab) => (tab.id === tabId ? { ...tab, snapshot } : tab)),
  );
}

export function closeCardImageTab(tabId: string) {
  const currentTabs = get(cardImageTabs);
  const index = currentTabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  const closingTab = currentTabs[index];
  const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
  cardImageTabs.set(nextTabs);

  if (get(activeCardImageTabId) !== tabId) {
    return;
  }

  if (nextTabs.length > 0) {
    const nextIndex = Math.min(index, nextTabs.length - 1);
    activateCardImageTab(nextTabs[nextIndex].id);
    return;
  }

  activeCardImageTabId.set(null);
  const sourceTabId = closingTab?.sourceTabId ?? findSourceTabId(closingTab?.cdbPath ?? '');
  if (sourceTabId) {
    activeTabId.set(sourceTabId);
  }
  activateEditorView();
}
