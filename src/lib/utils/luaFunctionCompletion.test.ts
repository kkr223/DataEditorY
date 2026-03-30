import { describe, expect, test } from 'bun:test';
import {
  getCompletionInsertParameters,
  isFunctionReferenceParameter,
  shouldInsertFunctionReferenceOnly,
} from './luaFunctionCompletion';

describe('lua function completion helpers', () => {
  test('detects function-typed parameters', () => {
    expect(isFunctionReferenceParameter('function|nil f')).toBe(true);
    expect(isFunctionReferenceParameter('function con_func')).toBe(true);
    expect(isFunctionReferenceParameter('nil|function op_func')).toBe(true);
    expect(isFunctionReferenceParameter('integer player')).toBe(false);
  });

  test('only enables reference insertion for the active function parameter', () => {
    expect(shouldInsertFunctionReferenceOnly(['integer player', 'function|nil f'], 1)).toBe(true);
    expect(shouldInsertFunctionReferenceOnly(['function f', 'integer tp'], 0)).toBe(true);
    expect(shouldInsertFunctionReferenceOnly(['function f', 'integer tp'], 1)).toBe(false);
    expect(shouldInsertFunctionReferenceOnly(['function f'], 2)).toBe(false);
  });

  test('only keeps required parameters for function completion insertion', () => {
    expect(getCompletionInsertParameters(['integer player', 'integer min?', '...'])).toEqual(['integer player']);
    expect(getCompletionInsertParameters(['integer player[, integer min=1, integer max=12, ...]']))
      .toEqual(['integer player']);
    expect(getCompletionInsertParameters(['integer player[, integer min=1]']))
      .toEqual(['integer player']);
    expect(getCompletionInsertParameters(['Card c', 'function|nil f', 'Card|Group ex|nil', '...']))
      .toEqual(['Card c', 'function|nil f', 'Card|Group ex|nil']);
  });
});
