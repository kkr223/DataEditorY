import { expect, test } from 'bun:test';
import { createListenerScope } from './listenerScope';

test('listeners that finish registering after disposal are immediately removed', async () => {
  const scope = createListenerScope();
  let finish!: (unlisten: () => void) => void;
  let removals = 0;
  scope.add(new Promise(resolve => { finish = resolve; }));
  scope.dispose();
  finish(() => { removals++; });
  await Promise.resolve();
  scope.dispose();
  expect(removals).toBe(1);
});

test('registered and late listeners are each removed once', async () => {
  const scope = createListenerScope();
  let removals = 0;
  scope.add(Promise.resolve(() => { removals++; }));
  await Promise.resolve();
  scope.dispose();
  scope.add(Promise.resolve(() => { removals++; }));
  await Promise.resolve();
  scope.dispose();
  expect(scope.disposed).toBe(true);
  expect(removals).toBe(2);
});
