export type CardToolRequest = { id: string; tabId: string; cardIds: number[]; kind: 'batch' | 'showcase'; groupId?: string };
export const cardToolState = $state<{ request: CardToolRequest | null }>({ request: null });
