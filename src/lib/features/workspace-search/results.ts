import type { ReplacementTarget, WorkspaceSearchGroup, WorkspaceSearchMatch, WorkspaceSearchResult } from './types';

export const countSearchMatches = (result: WorkspaceSearchResult | null) => result
  ? [...result.cards, ...result.scripts].reduce((count, group) => count + group.matches.length, 0) : 0;

export const replacementTarget = (group: WorkspaceSearchGroup, match: WorkspaceSearchMatch): ReplacementTarget => ({
  cardId: group.cardId, script: group.path !== null, field: match.field,
  line: match.line, column: match.column, endColumn: match.endColumn, sourceHash: match.sourceHash,
});

export const replacementKey = (target: Omit<ReplacementTarget, 'sourceHash'>) => JSON.stringify([
  target.script, target.cardId, target.field, target.line, target.column, target.endColumn,
]);

export const replacementTargets = (result: WorkspaceSearchResult) => [...result.cards, ...result.scripts]
  .flatMap(group => group.matches.map(match => replacementTarget(group, match)));

export const excludeSearchResult = (result: WorkspaceSearchResult, group: WorkspaceSearchGroup, match?: WorkspaceSearchMatch) => {
  const scope = group.path === null ? 'cards' : 'scripts';
  if (!result[scope].includes(group) || (match && !group.matches.includes(match))) return result;
  const groups = result[scope].flatMap(item => {
    if (item !== group) return [item];
    const matches = match ? item.matches.filter(hit => hit !== match) : [];
    return matches.length ? [{ ...item, matches }] : [];
  });
  return { ...result, [scope]: groups };
};
