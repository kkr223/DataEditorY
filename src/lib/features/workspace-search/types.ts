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
