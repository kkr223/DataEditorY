export type CardSurfaceId = 'card' | 'script' | 'image' | 'search' | 'ai';

export const cardSurfaceState = $state({
  activeSurface: 'card' as CardSurfaceId,
  explorerPinned: true,
});

export function activateCardSurface(surface: CardSurfaceId) {
  cardSurfaceState.activeSurface = surface;
}

export function toggleCardExplorerPinned() {
  cardSurfaceState.explorerPinned = !cardSurfaceState.explorerPinned;
}
