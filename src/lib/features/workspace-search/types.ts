import type { CardDataEntry } from '#lib/types/index.ts';

export type WorkspaceSearchOptions = {
  text: string;
  caseSensitive: boolean;
  regex: boolean;
  searchCards: boolean;
  searchScripts: boolean;
};

export type WorkspaceSearchRequest = WorkspaceSearchOptions & {
  buffers: Array<{ cardId: number; content: string }>;
};

export type WorkspaceSearchMatch = {
  field: string;
  line: number;
  column: number;
  endColumn: number;
  before: string;
  matched: string;
  after: string;
  sourceHash: string;
};

export type WorkspaceSearchGroup = {
  cardId: number;
  cardName: string;
  path: string | null;
  matches: WorkspaceSearchMatch[];
};

export type WorkspaceSearchResult = {
  cards: WorkspaceSearchGroup[];
  scripts: WorkspaceSearchGroup[];
  limited: boolean;
  warnings: string[];
};
export type ReplacementTarget = Pick<WorkspaceSearchMatch, 'field' | 'line' | 'column' | 'endColumn' | 'sourceHash'> & {
  cardId: number;
  script: boolean;
};

export type WorkspaceReplaceRequest = Pick<WorkspaceSearchOptions, 'text' | 'caseSensitive' | 'regex'> & {
  replacement: string;
  targets: ReplacementTarget[];
  buffers: WorkspaceSearchRequest['buffers'];
};

export type WorkspaceReplacePreview = {
  cards: Array<{ before: CardDataEntry; after: CardDataEntry }>;
  scripts: Array<{ cardId: number; cardName: string; path: string; before: string; after: string }>;
  edits: Array<{ target: ReplacementTarget; replacement: string }>;
};
