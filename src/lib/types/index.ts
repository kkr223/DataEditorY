export interface SearchFilters {
  id: string;
  name: string;
  desc: string;
  rule: string;
  atkMin: string;
  atkMax: string;
  defMin: string;
  defMax: string;
  type: string;
  subtype: string;
  attribute: string;
  race: string;
  setcode1: string;
  setcode2: string;
  setcode3: string;
  setcode4: string;
}

export interface CardSearchQuery {
  whereClause: string;
  params: Record<string, string | number>;
}

export interface CardDataEntry {
  code: number;
  alias: number;
  setcode: number[];
  type: number;
  attack: number;
  defense: number;
  level: number;
  race: number;
  attribute: number;
  category: number;
  ot: number;
  name: string;
  desc: string;
  strings: string[];
  lscale: number;
  rscale: number;
  linkMarker: number;
  ruleCode: number;
}

export interface DbWorkspaceState {
  id: string;
  path: string;
  name: string;
  cachedCards: CardDataEntry[];
  cachedTotal: number;
  cachedPage: number;
  cachedFilters: string;
  cachedSelectedIds: number[];
  cachedSelectedId: number | null;
  cachedSelectionAnchorId: number | null;
  isDirty: boolean;
}

export interface CardDraftState {
  originalCode: number | null;
  snapshot: string;
  card: CardDataEntry;
}

export interface ScriptWorkspaceState {
  id: string;
  cdbPath: string;
  sourceTabId: string | null;
  cardCode: number;
  cardName: string;
  scriptPath: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  viewState: unknown | null;
  createdFromTemplate: boolean;
}

export type ScriptTabState = ScriptWorkspaceState;

export interface LuaConstantItem {
  name: string;
  value: string;
  description: string;
  category: string;
}

export interface LuaFunctionItem {
  name: string;
  namespace: string;
  shortName: string;
  signature: string;
  returnType: string;
  parameters: string[];
  description: string;
  raw: string;
  category?: string;
}

export interface LuaSnippetItem {
  name: string;
  prefix: string;
  body: string[];
  description: string;
  sortText: string;
}

export interface LuaCatalog {
  constants: LuaConstantItem[];
  functions: LuaFunctionItem[];
  snippets: LuaSnippetItem[];
  keywords: string[];
}

export interface SelectOption<T = string | number> {
  value: T;
  label?: string;
  key?: string;
}

export interface BitOption {
  bit: number;
  key: string;
}

export interface LinkMarkerOption {
  bit: number;
  label: string;
  row: number;
  col: number;
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  id: '',
  name: '',
  desc: '',
  rule: '',
  atkMin: '',
  atkMax: '',
  defMin: '',
  defMax: '',
  type: '',
  subtype: '',
  attribute: '',
  race: '',
  setcode1: '',
  setcode2: '',
  setcode3: '',
  setcode4: '',
};
