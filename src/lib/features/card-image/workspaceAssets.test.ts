import { expect, test } from 'bun:test';
import {
  isWorkspaceCardImageAssetReference,
  parseWorkspaceCardImageAssetReference,
  resolveWorkspaceCardImageAssetSrc,
} from './workspaceAssets';

test('accepts only bounded card image workspace asset references', () => {
  expect(parseWorkspaceCardImageAssetReference('workspace-asset:card-image/123/art.png')).toEqual({
    parts: ['card-image', '123', 'art.png'],
    mimeType: 'image/png',
  });
  expect(isWorkspaceCardImageAssetReference('workspace-asset:card-image/123/foreground.jpg')).toBe(true);
  expect(isWorkspaceCardImageAssetReference('workspace-asset:../art.png')).toBe(false);
  expect(resolveWorkspaceCardImageAssetSrc(
    'D:\\project\\cards.cdb',
    'workspace-asset:card-image/123/art.png',
  )).toBe('D:\\project\\.dey\\card-image\\123\\art.png');
});
