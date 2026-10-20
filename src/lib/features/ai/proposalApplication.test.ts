import { expect, test } from 'bun:test';
import { createAiProposalApplier } from './proposalApplication';
import type { AiProposalStatusUpdate, WorkspaceAiPatch, WorkspaceAiProposal } from './types';

const patch = (id: string): WorkspaceAiPatch => ({
  id, kind: 'image', documentId: 'A', cdbPath: 'A.cdb', cardCode: 100, patch: {},
});
const proposal = (): WorkspaceAiProposal => ({
  id: 'proposal', threadId: 'thread', title: '', summary: '', createdAt: 1,
  toolRuns: [], patches: [patch('first'), patch('second'), patch('third')],
});

test('application stops at the first failure and records partial results in the captured workspace', async () => {
  const calls: string[] = [];
  let status: AiProposalStatusUpdate | undefined;
  let owner = '';
  const applier = createAiProposalApplier({
    applyPatch: async patch => {
      calls.push(patch.id);
      if (patch.id === 'second') throw new Error('conflict');
    },
    updateStatus: (update, path) => { status = update; owner = path; },
  });
  const result = await applier.apply({ proposal: proposal(), ownerPath: 'A.cdb', fullAccess: true });
  expect(result).toEqual({ ok: false, message: 'conflict' });
  expect(calls).toEqual(['first', 'second']);
  expect(owner).toBe('A.cdb');
  expect(status?.status).toBe('partially_applied');
  expect(status?.applyLog?.map(item => [item.patchId, item.ok, item.usedFullAccess]))
    .toEqual([['first', true, true], ['second', false, true]]);
});

test('in-flight application rejects duplicate submissions and captures its authorization mode', async () => {
  let resume!: () => void;
  const blocked = new Promise<void>(resolve => { resume = resolve; });
  const updates: Array<{ update: AiProposalStatusUpdate; path: string }> = [];
  const applier = createAiProposalApplier({
    applyPatch: async () => { await blocked; },
    updateStatus: (update, path) => { updates.push({ update, path }); },
  });
  const request = { proposal: proposal(), ownerPath: 'A.cdb', fullAccess: false };
  const running = applier.apply(request);
  request.ownerPath = 'B.cdb';
  request.fullAccess = true;
  expect(await applier.apply(request)).toBeNull();
  resume();
  expect((await running)?.ok).toBe(true);
  expect(updates).toHaveLength(1);
  expect(updates[0].path).toBe('A.cdb');
  expect(updates[0].update.status).toBe('applied');
  expect(updates[0].update.applyLog?.every(entry => !entry.usedFullAccess)).toBe(true);
});

test('a failed audit write propagates the error and releases the application guard', async () => {
  let fail = true;
  const applier = createAiProposalApplier({
    applyPatch: async () => {},
    updateStatus: () => { if (fail) throw new Error('metadata unavailable'); },
  });
  const request = { proposal: proposal(), ownerPath: 'A.cdb', fullAccess: false };
  await expect(applier.apply(request)).rejects.toThrow('metadata unavailable');
  fail = false;
  expect((await applier.apply(request))?.ok).toBe(true);
});

test('single-patch application preserves previous audit entries and remains partial', async () => {
  const record = proposal();
  record.applyLog = [{ patchId: 'old', ok: false, message: 'old error', usedFullAccess: false, createdAt: 1 }];
  let status: AiProposalStatusUpdate | undefined;
  const calls: string[] = [];
  const applier = createAiProposalApplier({
    applyPatch: async patch => { calls.push(patch.id); },
    updateStatus: update => { status = update; },
  });
  await applier.apply({ proposal: record, singlePatch: record.patches[1], ownerPath: 'A.cdb', fullAccess: false });
  expect(calls).toEqual(['second']);
  expect(status?.status).toBe('partially_applied');
  expect(status?.applyLog?.map(item => item.patchId)).toEqual(['old', 'second']);
  expect(record.applyLog).toHaveLength(1);
});

test('failure before any successful patch marks the proposal failed', async () => {
  let status: AiProposalStatusUpdate | undefined;
  const applier = createAiProposalApplier({
    applyPatch: async () => { throw new Error('workspace closed'); },
    updateStatus: update => { status = update; },
  });
  await applier.apply({ proposal: proposal(), ownerPath: 'A.cdb', fullAccess: false });
  expect(status?.status).toBe('failed');
  expect(status?.applyLog).toHaveLength(1);
});
