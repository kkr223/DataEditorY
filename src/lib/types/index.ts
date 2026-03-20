export interface SearchFilters {
  name?: string;
  id?: string;
  desc?: string;
  rule?: string;
  atkMin?: string | number;
  atkMax?: string | number;
  defMin?: string | number;
  defMax?: string | number;
  type?: string;
  subtype?: string;
  attribute?: string;
  race?: string;
  setcode1?: string;
  setcode2?: string;
  setcode3?: string;
  setcode4?: string;
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

export interface SearchFilterState {
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

export const DEFAULT_SEARCH_FILTERS: SearchFilterState = {
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
