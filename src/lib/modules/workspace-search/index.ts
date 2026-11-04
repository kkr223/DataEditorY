import type { ExtensionModule } from '#lib/platform/index.ts';

export const workspaceSearchModule: ExtensionModule = {
  id: 'workspace-search',
  dependencies: ['card', 'lua'],
  workbenchContributions: [{
    id: 'workspace-search.card-surface',
    workbenchId: 'card.workbench',
    slot: 'surface',
    order: 35,
    metadata: { surfaceId: 'search', labelKey: 'surface.search', icon: '⌕' },
    component: () => import('#lib/features/workspace-search/SearchSurface.svelte'),
  }],
};
