import { expect, test } from 'bun:test';
import { Group, Leafer, Watcher } from '@leafer/node';
import { destroyCardImageRenderer } from './rendererLifecycle';

// Exercise Leafer's real teardown without creating a canvas or opening a window.
class SortedTestScene extends Leafer {
  constructor() {
    super();
    this.__setLeafer(this);
    this.watcher = new Watcher(this, { usePartLayout: true });
    this.__controllers.push(this.watcher);
  }
}

test('destroys sorted scene children before their watcher is released', async () => {
  const scene = new SortedTestScene();
  const child = new Group({ zIndex: 1 });
  scene.add(child);
  // A completed layout clears the change flag while retaining sorted children.
  scene.__layout.affectChildrenSort = true;
  scene.__layout.childrenSortChanged = false;

  const card = { leafer: scene, destroy: () => scene.destroy() };
  destroyCardImageRenderer(card);
  expect(child.destroyed).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(scene.destroyed).toBe(true);
  expect(scene.children).toHaveLength(0);
  expect(scene.watcher.target).toBeNull();
  expect(destroyCardImageRenderer(card)).toBe(undefined);
});

test('retains the Leafer fallback for legacy renderers and accepts empty references', () => {
  const calls: string[] = [];
  destroyCardImageRenderer({
    leafer: {
      clear: () => { calls.push('clear'); },
      destroy: () => { calls.push('destroy'); },
    },
  });
  expect(calls).toEqual(['clear', 'destroy']);
  expect(destroyCardImageRenderer(null)).toBe(undefined);
  expect(destroyCardImageRenderer(undefined)).toBe(undefined);
});
