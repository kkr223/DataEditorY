import type { CardDataEntry } from '$lib/types';
import type { RuleOperand, RuleSearchExpression } from '$lib/domain/search/ruleExpression';

export const CARD_COLLECTION_TYPE = 'ygo.card-collection';

export type CardCollectionMetadata = {
  total: number;
};

export type CardSearchExpression =
  | { kind: 'all' }
  | { kind: 'and'; expressions: CardSearchExpression[] }
  | { kind: 'or'; expressions: CardSearchExpression[] }
  | { kind: 'not'; expression: CardSearchExpression }
  | { kind: 'textContains'; field: 'name' | 'desc'; value: string }
  | { kind: 'orderedTextContains'; field: 'name' | 'desc'; values: string[] }
  | { kind: 'idPrefix'; value: string }
  | {
      kind: 'compare';
      field: 'id' | 'alias' | 'atk' | 'def' | 'level' | 'attribute' | 'race' | 'type' | 'linkMarker';
      operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
      value: number;
    }
  | {
      kind: 'maskContains';
      field: 'attribute' | 'race' | 'type' | 'linkMarker';
      value: number;
    }
  | {
      kind: 'maskExcludes';
      field: 'attribute' | 'race' | 'type' | 'linkMarker';
      value: number;
    }
  | { kind: 'setcodeContains'; value: number }
  | { kind: 'inIds'; values: number[] }
  | RuleSearchExpression;

export type CardRuleOperand = RuleOperand;

export type CardCollectionQuery =
  | {
      kind: 'search';
      expression: CardSearchExpression;
      page: number;
      pageSize: number;
    }
  | { kind: 'getById'; cardId: number }
  | { kind: 'getByIds'; cardIds: number[] }
  | { kind: 'findByNames'; names: string[] }
  | { kind: 'all' };

export type CardCollectionCommand =
  | { kind: 'upsert'; cards: CardDataEntry[] }
  | { kind: 'delete'; cardIds: number[] };

export type CardSearchPage = {
  cards: CardDataEntry[];
  total: number;
};

export const validateCard = (value: unknown): CardDataEntry => {
  if (!value || typeof value !== 'object') {
    throw new Error('Card must be an object');
  }
  const card = value as Partial<CardDataEntry>;
  if (!Number.isInteger(card.code) || Number(card.code) < 0) {
    throw new Error('Card code must be a non-negative integer');
  }
  if (typeof card.name !== 'string' || typeof card.desc !== 'string') {
    throw new Error('Card name and description must be strings');
  }
  if (!Array.isArray(card.setcode) || !Array.isArray(card.strings)) {
    throw new Error('Card setcode and strings must be arrays');
  }
  return value as CardDataEntry;
};

export const validateCardCollectionSnapshot = (value: unknown) => {
  if (!Array.isArray(value)) {
    throw new Error('Card collection snapshot must be an array');
  }
  return value.map(validateCard);
};
