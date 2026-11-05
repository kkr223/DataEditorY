import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { activeTab } from '#lib/stores/db.ts';
import { cardSurfaceState } from '#lib/modules/card/workbench/surfaceState.svelte.ts';
import { openContextMenu, updateContextMenu, type ContextMenuItem } from '#lib/features/context-menu/menu.svelte.ts';
import { pathExists, revealFile } from '#lib/native/assetApi.ts';
import type { WorkspaceSearchGroup, WorkspaceSearchMatch } from './types';

export const openWorkspaceSearchMenu = (event: MouseEvent, input: {
  owner: { id: string; path: string };
  group: WorkspaceSearchGroup;
  match?: WorkspaceSearchMatch;
  isCurrent: () => boolean;
  onOpen: (group: WorkspaceSearchGroup, match: WorkspaceSearchMatch) => unknown | Promise<unknown>;
  onExclude?: () => void;
}) => {
  const { owner, group, match } = input;
  const current = () => get(activeTab)?.id === owner.id && get(activeTab)?.path === owner.path
    && cardSurfaceState.activeSurface === 'search' && input.isCurrent();
  if (!current()) return;
  const t = (key: string) => String(get(_)(key));
  const guard = (action: () => unknown | Promise<unknown>) => () => current() ? action() : undefined;
  const copy = (text: string) => guard(() => navigator.clipboard.writeText(text));
  const target = match ?? group.matches[0];
  const path = group.path ?? owner.path;
  let exists = false;
  const items = (): ContextMenuItem[] => [
    { id: 'open-result', label: t(group.path ? 'workspace_search.open_result' : 'context_menu.edit_card'),
      disabled: !target, action: guard(() => target && input.onOpen(group, target)) },
    ...(group.path ? [{ id: 'open-card', label: t('context_menu.edit_card'), disabled: !target,
      action: guard(() => target && input.onOpen({ ...group, path: null }, target)) }] : []), null,
    ...(match ? [{ id: 'copy-match', label: t('workspace_search.copy_match'), disabled: !match.matched,
      action: copy(match.matched) }] : []),
    { id: 'copy-result', label: t(match ? 'workspace_search.copy_result' : 'workspace_search.copy_group'),
      action: copy(match ? `${match.before}${match.matched}${match.after}` : group.matches
        .map((hit) => `${hit.field}:${hit.line}:${hit.column}\t${hit.before}${hit.matched}${hit.after}`).join('\n')) },
    { id: 'copy-code', label: t('context_menu.copy_code'), action: copy(String(group.cardId)) },
    { id: 'copy-name', label: t('context_menu.copy_name'), action: copy(group.cardName) }, null,
    { id: 'copy-path', label: t('context_menu.copy_path'), action: copy(path) },
    { id: 'reveal', label: t(group.path ? 'context_menu.reveal_script' : 'context_menu.reveal_database'),
      disabled: !exists, action: guard(() => revealFile(path)) },
    ...(input.onExclude ? [null, { id: 'exclude', label: t('workspace_search.exclude_result'), action: guard(input.onExclude) }] : []),
  ];
  const token = openContextMenu(event, items());
  void pathExists(path).then((value) => {
    if (!current()) return;
    exists = value;
    updateContextMenu(token, items());
  }).catch(() => {});
};
