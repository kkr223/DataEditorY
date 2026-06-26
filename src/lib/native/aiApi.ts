export {
  AI_TOOL_NAMES,
  extractRequestedSkillNames,
  loadAiSkills,
  parseSkillMarkdown,
  runWorkspaceAgent,
  type AiAppContext,
  type AiAgentResult,
  type AiSkill,
  type AiTokenUsage,
  type AgentStage,
  type AgentToolCallEvent,
  type AgentToolResultEvent,
} from '$lib/features/ai/service';

export type AiProposal = {
  id: string;
  kind: 'card-patch' | 'script-patch' | 'image-patch' | 'text';
  title: string;
  payload: unknown;
  createdAt: number;
};

export type AiToolRun = {
  id: string;
  name: string;
  input?: unknown;
  outputSummary?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
};
