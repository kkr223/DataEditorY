export type CardSurfaceId = string;

export const cardSurfaceState = $state({
  activeSurface: 'card' as CardSurfaceId,
  explorerPinned: true,
  /** Incremented by the rail when a surface should open its current item. */
  openRequests: {} as Record<string, number>,
  /** Lua surface waits for workspace metadata restoration before acting. */
  scriptSelectionReady: false,
});

export function activateCardSurface(surface: CardSurfaceId) {
  cardSurfaceState.activeSurface = surface;
}

export function requestSurfaceOpen(surface: CardSurfaceId) {
  cardSurfaceState.openRequests[surface] = (cardSurfaceState.openRequests[surface] ?? 0) + 1;
}

export function consumeSurfaceOpenRequest(surface: CardSurfaceId) {
  cardSurfaceState.openRequests[surface] = 0;
}

export function toggleCardExplorerPinned() {
  cardSurfaceState.explorerPinned = !cardSurfaceState.explorerPinned;
}
