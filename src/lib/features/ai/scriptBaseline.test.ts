import { expect, test } from 'bun:test';
import { createScriptBaseline, matchesScriptBaseline } from './scriptBaseline';

test('script proposals detect intervening edits, creation and deletion without storing a copy', async () => {
  const baseline = await createScriptBaseline('-- original\r\n');
  expect(matchesScriptBaseline(baseline, await createScriptBaseline('-- original\n'))).toBe(true);
  expect(matchesScriptBaseline(baseline, await createScriptBaseline('-- edited'))).toBe(false);
  expect(matchesScriptBaseline(baseline, await createScriptBaseline(null))).toBe(false);
  expect(matchesScriptBaseline(await createScriptBaseline(null), await createScriptBaseline(''))).toBe(false);
  expect(matchesScriptBaseline(undefined, baseline)).toBe(false);
  expect(baseline.sha256?.length).toBe(64);
  expect(JSON.stringify(baseline).includes('original')).toBe(false);
});
