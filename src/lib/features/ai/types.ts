export type WorkspaceAiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'event';
  content: string;
  createdAt: number;
  model?: string;
};

export type WorkspaceAiContextRef = {
  type: 'cdb' | 'card' | 'selection' | 'script' | 'image';
  label: string;
  value?: unknown;
};

export type WorkspaceAiToolRun = {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  outputSummary?: string;
  keyIds?: Array<string | number>;
  createdAt: number;
};

export type WorkspaceAiPatch =
  | {
      id: string;
      kind: 'card';
      documentId: string;
      cdbPath: string;
      cardCode: number;
      before: unknown;
      patch: unknown;
      after: unknown;
    }
  | {
      id: string;
      kind: 'batch-card';
      documentId: string;
      cdbPath: string;
      summary: unknown;
      cards: Array<{
        cardCode: number;
        before: unknown;
        patch: unknown;
        after: unknown;
      }>;
    }
  | {
      id: string;
      kind: 'script';
      documentId: string;
      cdbPath: string;
      cardCode?: number;
      path: string;
      content: string;
      baseline?: import('$lib/features/ai/scriptBaseline').ScriptProposalBaseline;
    }
  | {
      id: string;
      kind: 'script-test-plan';
      documentId: string;
      cdbPath: string;
      cardCode: number;
      path: string;
      plan: unknown;
    }
  | {
      id: string;
      kind: 'image';
      documentId: string;
      cdbPath: string;
      cardCode: number;
      patch: unknown;
    };

export type WorkspaceAiProposal = {
  id: string;
  threadId: string;
  title: string;
  summary: string;
  patches: WorkspaceAiPatch[];
  toolRuns: WorkspaceAiToolRun[];
  model?: string;
  createdAt: number;
  status?: 'pending' | 'applied' | 'dismissed' | 'partially_applied' | 'failed';
  appliedAt?: number;
  applyLog?: Array<{
    patchId: string;
    ok: boolean;
    message: string;
    usedFullAccess: boolean;
    createdAt: number;
  }>;
};

export type WorkspaceAiThread = {
  id: string;
  title: string;
  scope: 'workspace' | 'cdb' | 'task';
  messages: WorkspaceAiMessage[];
  contextRefs: WorkspaceAiContextRef[];
  toolRuns: WorkspaceAiToolRun[];
  proposalIds: string[];
  createdAt: number;
  updatedAt: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type AiProposalStatusUpdate = {
  threadId: string;
  proposalId: string;
  status: WorkspaceAiProposal['status'];
  applyLog?: WorkspaceAiProposal['applyLog'];
};
