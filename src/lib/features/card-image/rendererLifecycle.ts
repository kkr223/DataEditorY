type CardImageRenderer = {
  leafer?: {
    clear?: () => void;
    destroy?: () => void;
  };
  destroy?: () => void;
};

export function destroyCardImageRenderer(card: CardImageRenderer | null | undefined) {
  if (!card) return;

  // Leafer 2.2 destroys its watcher before removing sorted children. Clear the
  // children while the watcher is alive so scene destruction can finish.
  card.leafer?.clear?.();
  if (card.destroy) {
    card.destroy();
    return;
  }
  card.leafer?.destroy?.();
}
