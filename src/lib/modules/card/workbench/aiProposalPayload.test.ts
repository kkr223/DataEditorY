import { describe, expect, test } from 'bun:test';
import {
  extractCardPatch,
  extractImagePatch,
  extractLuaBlock,
  normalizeCardPatch,
  readProposalPayload,
} from './aiProposalPayload';
import type { WorkspaceAiProposal } from './workspaceMetadataState.svelte';

describe('AI proposal payload helpers', () => {
  test('extracts a safe card patch from fenced JSON', () => {
    const patch = extractCardPatch([
      'Proposal:',
      '```json',
      '{"cardPatch":{"name":"Test Card","attack":"2500","setcode":["452","bad",4660],"unknown":"ignored"}}',
      '```',
    ].join('\n'));

    expect(patch).toEqual({
      name: 'Test Card',
      attack: 2500,
      setcode: [452, 4660],
    });
  });

  test('ignores unknown fields and invalid patch payloads', () => {
    expect(normalizeCardPatch({ unknown: 'value' })).toBeNull();
    expect(extractCardPatch('```json\n{"notCardPatch":{"name":"Nope"}}\n```')).toBeNull();
  });

  test('extracts lua proposal blocks', () => {
    expect(extractLuaBlock('```lua\nlocal s,id=GetID()\nfunction s.initial_effect(c)\nend\n```'))
      .toBe('local s,id=GetID()\nfunction s.initial_effect(c)\nend');
  });

  test('extracts a whitelisted card image patch', () => {
    const patch = extractImagePatch([
      '```json',
      '{"imagePatch":{"form":{"rare":"ur","scale":"1.25","unknown":"ignored"},"exportScalePercent":"50"}}',
      '```',
    ].join('\n'));

    expect(patch).toEqual({
      form: { rare: 'ur', scale: 1.25 },
      exportScalePercent: 50,
    });
  });

  test('normalizes stored proposal payloads before application', () => {
    const proposal = {
      id: 'proposal-1',
      kind: 'card-patch',
      title: 'Patch card',
      payload: {
        text: 'patch',
        contextRefs: [{ type: 'card', label: '1 Test' }],
        cardPatch: { desc: 'Updated', defense: '1800' },
        scriptContent: 'local s,id=GetID()',
        imagePatch: { form: { rare: 'gr', mark25th: true } },
      },
      createdAt: 1,
      status: 'pending',
    } as unknown as WorkspaceAiProposal;

    const payload = readProposalPayload(proposal);
    expect(payload.text).toBe('patch');
    expect(payload.cardPatch).toEqual({ desc: 'Updated', defense: 1800 });
    expect(payload.scriptContent).toBe('local s,id=GetID()');
    expect(payload.imagePatch).toEqual({ form: { rare: 'gr', mark25th: true } });
  });
});
