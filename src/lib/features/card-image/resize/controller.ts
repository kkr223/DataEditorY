export type CardImageResizeState = {
  previewShell: HTMLDivElement | null;
  previewWidth: number;
  previewHeight: number;
  foregroundEditorOpen: boolean;
  foregroundPreviewShell: HTMLDivElement | null;
  foregroundPreviewWidth: number;
  foregroundPreviewHeight: number;
};

export type CardImageResizeControllerOptions = {
  state: CardImageResizeState;
  measureForegroundRenderBounds: () => void;
};

export const createCardImageResizeController = ({
  state,
  measureForegroundRenderBounds,
}: CardImageResizeControllerOptions) => {
  let foregroundResizeObserver: ResizeObserver | null = null;
  let previewResizeObserver: ResizeObserver | null = null;

  const disconnectPreviewObserver = () => {
    previewResizeObserver?.disconnect();
    previewResizeObserver = null;
  };

  const disconnectForegroundObserver = () => {
    foregroundResizeObserver?.disconnect();
    foregroundResizeObserver = null;
  };

  const observePreviewShell = () => {
    if (!state.previewShell) return;

    disconnectPreviewObserver();
    previewResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      state.previewWidth = entry.contentRect.width;
      state.previewHeight = entry.contentRect.height;
    });
    previewResizeObserver.observe(state.previewShell);

    return disconnectPreviewObserver;
  };

  const observeForegroundPreviewShell = () => {
    if (!state.foregroundPreviewShell || !state.foregroundEditorOpen) return;

    disconnectForegroundObserver();
    foregroundResizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      state.foregroundPreviewWidth = entry.contentRect.width;
      state.foregroundPreviewHeight = entry.contentRect.height;
      measureForegroundRenderBounds();
    });
    foregroundResizeObserver.observe(state.foregroundPreviewShell);

    return disconnectForegroundObserver;
  };

  const dispose = () => {
    disconnectPreviewObserver();
    disconnectForegroundObserver();
  };

  return {
    dispose,
    observeForegroundPreviewShell,
    observePreviewShell,
  };
};
