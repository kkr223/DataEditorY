import { createScriptBaseline, matchesScriptBaseline } from './scriptBaseline';
import type { WorkspaceAiPatch } from './types';

type ScriptChangeAccess = {
  readCurrent: () => Promise<string | null>;
  confirmConflict: () => Promise<boolean>;
  write: (content: string) => Promise<void>;
};

export async function applyAiScriptChange(
  patch: Extract<WorkspaceAiPatch, { kind: 'script' }>,
  access: ScriptChangeAccess,
) {
  const content = await access.readCurrent();
  if (!matchesScriptBaseline(patch.baseline, await createScriptBaseline(content))) {
    if (!(await access.confirmConflict())) {
      throw new Error('Skipped: script changed since the proposal was created');
    }
  }
  if (await access.readCurrent() !== content) {
    throw new Error('Script changed while confirming the proposal');
  }
  await access.write(patch.content);
}
