import { dataUrlToBlob } from '../render';

export type CardImageMediaState = {
  sourceImageUrl: string;
  foregroundRenderableUrl: string;
};

export type CardImageMediaControllerOptions = {
  state: CardImageMediaState;
};

export const createCardImageMediaController = ({
  state,
}: CardImageMediaControllerOptions) => {
  const revokeSourceImageUrl = () => {
    if (state.sourceImageUrl) {
      URL.revokeObjectURL(state.sourceImageUrl);
      state.sourceImageUrl = '';
    }
  };

  const revokeForegroundRenderableUrl = () => {
    if (state.foregroundRenderableUrl.startsWith('blob:')) {
      URL.revokeObjectURL(state.foregroundRenderableUrl);
    }
    state.foregroundRenderableUrl = '';
  };

  const syncForegroundRenderableUrl = async (url: string) => {
    revokeForegroundRenderableUrl();
    const nextUrl = url.trim();
    if (!nextUrl) {
      return;
    }

    if (nextUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(nextUrl);
      state.foregroundRenderableUrl = URL.createObjectURL(blob);
      return;
    }

    state.foregroundRenderableUrl = nextUrl;
  };

  const dispose = () => {
    revokeSourceImageUrl();
    revokeForegroundRenderableUrl();
  };

  return {
    dispose,
    revokeForegroundRenderableUrl,
    revokeSourceImageUrl,
    syncForegroundRenderableUrl,
  };
};
