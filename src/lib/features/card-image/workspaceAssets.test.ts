import { expect, test } from 'bun:test';
import {
  isWorkspaceCardImageAssetReference,
  parseWorkspaceCardImageAssetReference,
  resolveWorkspaceCardImageAssetSrc,
  matchesWorkspaceCardImageAsset,
} from './workspaceAssets';

test('accepts only bounded card image workspace asset references', () => {
  expect(parseWorkspaceCardImageAssetReference('workspace-asset:card-image/123/art.png')).toEqual({
    parts: ['card-image', '123', 'art.png'],
    mimeType: 'image/png',
  });
  expect(isWorkspaceCardImageAssetReference('workspace-asset:card-image/123/foreground.jpg')).toBe(true);
  expect(isWorkspaceCardImageAssetReference('workspace-asset:card-image/123/rarity-mask.webp')).toBe(true);
  expect(isWorkspaceCardImageAssetReference('workspace-asset:../art.png')).toBe(false);
  expect(resolveWorkspaceCardImageAssetSrc(
    'D:\\project\\cards.cdb',
    'workspace-asset:card-image/123/art.png',
  )).toBe('D:\\project\\.dey\\card-image\\123\\art.png');
});

test('versioned image references accept matching save acknowledgements and reject stale images', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const reference = `workspace-asset:card-image/123/foreground-${hash}.png`;
  expect(isWorkspaceCardImageAssetReference(reference)).toBe(true);
  expect(await matchesWorkspaceCardImageAsset(reference, 'data:image/png;base64,AQID')).toBe(true);
  expect(await matchesWorkspaceCardImageAsset(reference, 'data:image/png;base64,BAUG')).toBe(false);
  expect(await matchesWorkspaceCardImageAsset('workspace-asset:card-image/123/foreground.png', 'data:image/png;base64,AQID')).toBe(false);
  expect(isWorkspaceCardImageAssetReference('workspace-asset:card-image/123/foreground-../art.png')).toBe(false);
});
