import { describe, expect, test } from 'bun:test';
import { createLatestActivation } from './activation';

describe('latest script activation', () => {
  test('invalidates an older activation when a newer request begins', () => {
    const activation = createLatestActivation();
    const first = activation.begin();
    const second = activation.begin();

    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
