import { describe, expect, test } from 'bun:test';
import { loadExtensionComponents } from './loadExtensionComponents';

describe('loadExtensionComponents', () => {
  test('keeps working extensions when one fails', async () => {
    let errors = 0;
    const component = () => null;
    const loaded = await loadExtensionComponents([
      { id: 'working', component: async () => ({ default: component }) },
      { id: 'broken', component: async () => { throw new Error('broken'); } },
    ], () => { errors += 1; });

    expect(loaded).toEqual([{ id: 'working', component }]);
    expect(errors).toBe(1);
  });
});
