export type ScriptProposalBaseline = { exists: boolean; sha256: string | null };

export async function createScriptBaseline(content: string | null): Promise<ScriptProposalBaseline> {
  if (content === null) return { exists: false, sha256: null };
  const bytes = new TextEncoder().encode(content.replaceAll('\r\n', '\n'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { exists: true, sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
}

export function matchesScriptBaseline(expected: ScriptProposalBaseline | undefined, actual: ScriptProposalBaseline) {
  return Boolean(expected && expected.exists === actual.exists && expected.sha256 === actual.sha256);
}
