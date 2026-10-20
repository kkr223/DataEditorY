import { expect, test } from 'bun:test';
import { createScriptBaseline } from './scriptBaseline';
import { applyAiScriptChange } from './scriptChanges';
import type { WorkspaceAiPatch } from './types';

async function proposal(content: string | null): Promise<Extract<WorkspaceAiPatch, { kind: 'script' }>> {
  return {
    id: 'script', kind: 'script', cdbPath: 'A.cdb', documentId: 'A',
    path: 'script/c100.lua', content: '-- proposed', baseline: await createScriptBaseline(content),
  };
}

test('unchanged scripts apply without conflict prompts', async () => {
  let written = '';
  let confirmations = 0;
  await applyAiScriptChange(await proposal('-- old'), {
    readCurrent: async () => '-- old',
    confirmConflict: async () => { confirmations++; return true; },
    write: async content => { written = content; },
  });
  expect(written).toBe('-- proposed');
  expect(confirmations).toBe(0);
});

test('declining a script conflict leaves the file untouched', async () => {
  let writes = 0;
  await expect(applyAiScriptChange(await proposal('-- old'), {
    readCurrent: async () => '-- edited',
    confirmConflict: async () => false,
    write: async () => { writes++; },
  })).rejects.toThrow('Skipped: script changed');
  expect(writes).toBe(0);
});

test('edits made while a conflict prompt is open prevent writing', async () => {
  let content = '-- edited';
  let writes = 0;
  await expect(applyAiScriptChange(await proposal('-- old'), {
    readCurrent: async () => content,
    confirmConflict: async () => { content = '-- newer'; return true; },
    write: async () => { writes++; },
  })).rejects.toThrow('Script changed while confirming');
  expect(writes).toBe(0);
});

test('a missing baseline requires review even for an unchanged file', async () => {
  const patch = await proposal('-- old');
  delete patch.baseline;
  let confirmations = 0;
  await applyAiScriptChange(patch, {
    readCurrent: async () => '-- old',
    confirmConflict: async () => { confirmations++; return true; },
    write: async () => {},
  });
  expect(confirmations).toBe(1);
});
