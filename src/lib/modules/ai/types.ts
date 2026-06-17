export const AI_SESSION_TYPE = 'dataeditory.ai-session';

export type AiSessionMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
};

export type AiSessionDocument = {
  title: string;
  messages: AiSessionMessage[];
  targetReferences: Array<{
    typeId: string;
    documentId?: string;
    sourceUri?: string;
  }>;
};

export const validateAiSession = (value: unknown): AiSessionDocument => {
  if (!value || typeof value !== 'object') {
    throw new Error('AI session must be an object');
  }
  const input = value as Partial<AiSessionDocument>;
  return {
    title: typeof input.title === 'string' ? input.title : 'AI Session',
    messages: Array.isArray(input.messages)
      ? input.messages.filter((message): message is AiSessionMessage => (
          Boolean(message)
          && typeof message.id === 'string'
          && typeof message.content === 'string'
        ))
      : [],
    targetReferences: Array.isArray(input.targetReferences)
      ? input.targetReferences.filter((reference) => Boolean(reference?.typeId))
      : [],
  };
};
