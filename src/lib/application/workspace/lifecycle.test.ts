import { describe, expect, test } from 'bun:test';
import {
  clearWorkspaceLifecycleMetadata,
  hasDirtyWorkspaceDocuments,
  resolveWorkspaceLifecycleDocument,
  setWorkspaceLifecycleMetadata,
  shouldConfirmWorkspaceClose,
} from '$lib/application/workspace/lifecycle';
import type { DbWorkspaceDocument } from '$lib/core/workspace/types';

function createWorkspaceDocument(overrides: Partial<DbWorkspaceDocument> = {}): DbWorkspaceDocument {
  return {
    id: 'db-1',
    kind: 'db',
    title: 'cards.cdb',
    subtitle: 'D:/cards/cards.cdb',
    dirty: false,
    status: 'ready',
    savePolicy: 'manual',
    closeGuard: 'confirm-dirty',
    source: {
      path: 'D:/cards/cards.cdb',
      tabId: 'db-1',
    },
    viewState: null,
    legacy: {
      id: 'db-1',
      path: 'D:/cards/cards.cdb',
      name: 'cards.cdb',
      cachedCards: [],
      cachedTotal: 0,
      cachedPage: 1,
      cachedFilters: '{}',
      cachedSelectedIds: [],
      cachedSelectedId: null,
      cachedSelectionAnchorId: null,
      isDirty: false,
    },
    ...overrides,
  };
}

describe('workspace lifecycle helpers', () => {
  test('applies lifecycle metadata over projected workspace documents', () => {
    const document = createWorkspaceDocument({ dirty: false, closeGuard: 'none' });

    setWorkspaceLifecycleMetadata(document.id, {
      dirty: true,
      closeGuard: 'confirm-dirty',
    });
    const resolved = resolveWorkspaceLifecycleDocument(document);
    clearWorkspaceLifecycleMetadata(document.id);

    expect(resolved.dirty).toBe(true);
    expect(resolved.closeGuard).toBe('confirm-dirty');
  });

  test('recognizes when a workspace close needs confirmation', () => {
    expect(shouldConfirmWorkspaceClose(createWorkspaceDocument({
      dirty: true,
      closeGuard: 'confirm-dirty',
    }))).toBe(true);

    expect(shouldConfirmWorkspaceClose(createWorkspaceDocument({
      dirty: false,
      closeGuard: 'confirm-dirty',
    }))).toBe(false);
  });

  test('detects whether any workspace documents are dirty', () => {
    expect(hasDirtyWorkspaceDocuments([
      createWorkspaceDocument({ id: 'db-1', dirty: false }),
      createWorkspaceDocument({ id: 'db-2', dirty: true }),
    ])).toBe(true);

    expect(hasDirtyWorkspaceDocuments([
      createWorkspaceDocument({ id: 'db-1', dirty: false }),
      createWorkspaceDocument({ id: 'db-2', dirty: false }),
    ])).toBe(false);
  });
});
