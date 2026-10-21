import { expect, test } from 'bun:test';

const descriptor = Object.getOwnPropertyDescriptor(globalThis, '$state');
Object.defineProperty(globalThis, '$state', { configurable: true, value: (value: unknown) => value });
const proposals = await import('./aiProposalApplication.svelte');
if (descriptor) Object.defineProperty(globalThis, '$state', descriptor);
else Reflect.deleteProperty(globalThis, '$state');

test('draft proposals cannot cross workspace, card or revision boundaries', () => {
  const target = { workspaceId: 'A', cardCode: 100, revision: 2 };
  for (const wrong of [{ ...target, workspaceId: 'B' }, { ...target, cardCode: 200 }, { ...target, revision: 3 }]) {
    proposals.queueAiCardDraftPatch({ id: 'patch', ...target, patch: { name: 'proposal' } });
    expect(proposals.consumeAiCardDraftPatch('patch', wrong)).toBeNull();
    expect(proposals.aiProposalApplicationState.pendingCardDraftPatch).toBeNull();
  }
  proposals.queueAiCardDraftPatch({ id: 'patch', ...target, patch: { name: 'proposal' } });
  expect(proposals.consumeAiCardDraftPatch('patch', target)?.patch.name).toBe('proposal');
  expect(proposals.consumeAiCardDraftPatch('patch', target)).toBeNull();
});
