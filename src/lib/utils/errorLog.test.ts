import { describe, expect, test } from 'bun:test';
import { isExpectedCancellationError } from './errorLog';

describe('isExpectedCancellationError', () => {
  test('recognizes Monaco cancellation errors', () => {
    const error = new Error('Canceled');
    error.name = 'Canceled';

    expect(isExpectedCancellationError(error)).toBe(true);
  });

  test('does not hide unrelated rejection reasons', () => {
    expect(isExpectedCancellationError(new Error('Canceled'))).toBe(false);
    expect(isExpectedCancellationError('Canceled')).toBe(false);
    expect(isExpectedCancellationError(new Error('Export failed'))).toBe(false);
  });
});
