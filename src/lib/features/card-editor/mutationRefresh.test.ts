import { describe, expect, test } from 'bun:test';
import { refreshAfterMutation } from './mutationRefresh';

describe('mutation search refresh', () => {
  test('does not duplicate an active search even when it returns false', async () => {
    let activeCalls = 0;
    let cachedCalls = 0;
    const active = async () => { activeCalls += 1; return false; };
    const cached = async () => { cachedCalls += 1; return true; };

    expect(await refreshAfterMutation(active, cached)).toBe(true);
    expect(activeCalls).toBe(1);
    expect(cachedCalls).toBe(0);
  });

  test('refreshes the captured tab cache when it is no longer active', async () => {
    let cachedCalls = 0;
    const cached = async () => { cachedCalls += 1; return true; };

    expect(await refreshAfterMutation(null, cached)).toBe(true);
    expect(cachedCalls).toBe(1);
  });
});
