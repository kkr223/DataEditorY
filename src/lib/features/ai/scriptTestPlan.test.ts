import { describe, expect, test } from 'bun:test';
import { normalizeScriptTestPlan } from './scriptTestPlan';

describe('script test plan normalization', () => {
  test('accepts compact AI-authored JSON shapes', () => {
    const plan = normalizeScriptTestPlan({
      cardCode: '1001',
      includeScripts: [1002, 'folder/c1003.lua', 'notes.txt'],
      setup: [{ code: '1004', location: 'mzone', controller: 1 }],
      checks: [
        { kind: 'loadScript' },
        { kind: 'assert_field_count', location: 'mzone', player: 1, equals: 1 },
      ],
    }, 9999);

    expect(plan.cardCode).toBe(1001);
    expect(plan.includeScripts).toEqual(['c1001.lua', 'c1002.lua', 'c1003.lua', 'c1004.lua']);
    expect({
      code: plan.setup[0].code,
      controller: plan.setup[0].controller,
      owner: plan.setup[0].owner,
      location: plan.setup[0].location,
    }).toEqual({ code: 1004, controller: 1, owner: 1, location: 'mzone' });
    expect(plan.checks.map((item) => item.kind)).toEqual(['load-script', 'assert-field-count']);
  });
});
