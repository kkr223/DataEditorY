import { describe, expect, test } from 'bun:test';
import { isFunctionReferenceParameter, shouldInsertFunctionReferenceOnly } from './luaFunctionCompletion';

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
});
