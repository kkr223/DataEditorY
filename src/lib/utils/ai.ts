import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { createEmptyCard } from '$lib/domain/card/draft';
import {
  ATTRIBUTE_MAP,
  LINK_MARKER_NAME_TO_BIT,
  RACE_MAP,
  SUBTYPE_MAP,
} from '$lib/domain/card/taxonomy';

type AiRole = 'system' | 'user' | 'assistant' | 'tool';

type AiMessage = {
  role: AiRole;
  content?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type AiToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

export type AgentStage =
  | 'collecting_references'
  | 'requesting_model'
  | 'running_tools'
  | 'finalizing_response';

type AiConfig = {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  secretKey: string;
};

type OpenDbMeta = {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
};

export type AiAppContext = {
  getAiConfig: () => Promise<AiConfig>;
  listOpenDatabases: () => OpenDbMeta[];
  getActiveDatabaseId: () => string | null;
  getCardByIdInTab: (tabId: string, cardId: number) => Promise<CardDataEntry | undefined>;
  queryCardsRaw: (tabId: string, queryClause: string, params?: Record<string, string | number>) => Promise<CardDataEntry[]>;
  readCardScript: (code: number, dbPath?: string) => Promise<{
    exists: boolean;
    path: string | null;
    content: string | null;
  }>;
};

type ParsedCardDraft = {
  code?: number | null;
  alias?: number | null;
  name?: string;
  desc?: string;
  ot?: number | string | null;
  mainType?: 'monster' | 'spell' | 'trap' | null;
  subtypes?: string[];
  attribute?: string | null;
  race?: string | null;
  level?: number | null;
  leftScale?: number | null;
  rightScale?: number | null;
  attack?: number | null;
  defense?: number | null;
  linkMarkers?: string[];
  setcodes?: Array<string | number>;
  category?: number | null;
  strings?: string[];
};


const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_AGENT_STEPS = 12;

const ATTRIBUTE_NAME_TO_VALUE: Record<string, number> = { ...ATTRIBUTE_MAP };

const RACE_NAME_TO_VALUE: Record<string, number> = { ...RACE_MAP };

const SUBTYPE_NAME_TO_BIT: Record<string, number> = {
  normal: SUBTYPE_MAP.normal,
  effect: SUBTYPE_MAP.effect,
  fusion: SUBTYPE_MAP.fusion,
  ritual: SUBTYPE_MAP.ritual,
  spirit: SUBTYPE_MAP.spirit,
  union: SUBTYPE_MAP.union,
  gemini: SUBTYPE_MAP.gemini,
  tuner: SUBTYPE_MAP.tuner,
  synchro: SUBTYPE_MAP.synchro,
  token: SUBTYPE_MAP.token,
  quickplay: SUBTYPE_MAP.quickplay,
  continuous: SUBTYPE_MAP.continuous_spell,
  continuous_spell: SUBTYPE_MAP.continuous_spell,
  continuous_trap: SUBTYPE_MAP.continuous_trap,
  equip: SUBTYPE_MAP.equip,
  field: SUBTYPE_MAP.field,
  counter: SUBTYPE_MAP.counter,
  flip: SUBTYPE_MAP.flip,
  toon: SUBTYPE_MAP.toon,
  xyz: SUBTYPE_MAP.xyz,
  pendulum: SUBTYPE_MAP.pendulum,
  spssummon: SUBTYPE_MAP.spssummon,
  link: SUBTYPE_MAP.link,
  ritual_spell: SUBTYPE_MAP.ritual_spell,
};

const TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_open_databases',
      description: 'List the currently opened card databases.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_card',
      description: 'Get the current card being edited.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_card_by_id',
      description: 'Look up a specific card by password/id in the current or an opened database.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number' },
          dbPath: { type: 'string' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_cards',
      description: 'Search cards by name or effect text inside the current database or all opened databases.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          dbScope: { type: 'string', enum: ['current', 'all'] },
          dbPath: { type: 'string' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_card_script',
      description: 'Read an existing lua script for a card if one exists.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number' },
          dbPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
];

function normalizeKeyword(value: string) {
  return value.trim().toLowerCase().replace(/[\s_/-]+/g, '');
}

function normalizeSetcodes(input: Array<string | number> | undefined, current: number[]) {
  const values = Array.isArray(current) ? [...current] : [0, 0, 0, 0];
  while (values.length < 4) values.push(0);

  if (!input || input.length === 0) {
    return values.slice(0, 4);
  }

  const next = [0, 0, 0, 0];
  for (let index = 0; index < Math.min(4, input.length); index += 1) {
    const raw = input[index];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      next[index] = raw & 0xffff;
      continue;
    }

    const normalized = String(raw ?? '').trim().toLowerCase().replace(/^0x/, '');
    if (/^[\da-f]{1,4}$/i.test(normalized)) {
      next[index] = parseInt(normalized, 16) & 0xffff;
    }
  }

  return next;
}

function normalizeStrings(values: string[] | undefined, current: string[]) {
  const next = Array.isArray(current) ? [...current] : [];
  while (next.length < 16) next.push('');

  if (!Array.isArray(values)) {
    return next.slice(0, 16);
  }

  const normalized = values.map((item) => String(item ?? ''));
  while (normalized.length < 16) normalized.push('');
  return normalized.slice(0, 16);
}

function normalizeOt(value: number | string | null | undefined, current: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const key = normalizeKeyword(String(value ?? ''));
  if (!key) return current;

  const otMap: Record<string, number> = {
    ocg: 1,
    tcg: 2,
    ocgtcg: 3,
    custom: 4,
    sc: 9,
    sctcg: 11,
  };

  return otMap[key] ?? current;
}

function getMainTypeName(type: number): 'monster' | 'spell' | 'trap' | null {
  if (type & 0x1) return 'monster';
  if (type & 0x2) return 'spell';
  if (type & 0x4) return 'trap';
  return null;
}

function getSubtypeNames(type: number): string[] {
  const names: string[] = [];
  for (const [name, bit] of Object.entries(SUBTYPE_NAME_TO_BIT)) {
    if ((type & bit) !== 0) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

function getLinkMarkerNames(linkMarker: number): string[] {
  return Object.entries(LINK_MARKER_NAME_TO_BIT)
    .filter(([, bit]) => (linkMarker & bit) !== 0)
    .map(([name]) => name);
}

function serializeCardForAi(card: CardDataEntry | null | undefined) {
  if (!card) return null;

  return {
    code: Number(card.code ?? 0),
    alias: Number(card.alias ?? 0),
    name: String(card.name ?? ''),
    desc: String(card.desc ?? ''),
    ot: Number(card.ot ?? 0),
    type: Number(card.type ?? 0),
    mainType: getMainTypeName(Number(card.type ?? 0)),
    subtypes: getSubtypeNames(Number(card.type ?? 0)),
    attribute: Object.entries(ATTRIBUTE_NAME_TO_VALUE).find(([, value]) => value === Number(card.attribute ?? 0))?.[0] ?? null,
    race: Object.entries(RACE_NAME_TO_VALUE).find(([, value]) => value === Number(card.race ?? 0))?.[0] ?? null,
    attack: Number(card.attack ?? 0),
    defense: Number(card.defense ?? 0),
    level: Number(card.level ?? 0),
    lscale: Number(card.lscale ?? 0),
    rscale: Number(card.rscale ?? 0),
    linkMarker: Number(card.linkMarker ?? 0),
    linkMarkers: getLinkMarkerNames(Number(card.linkMarker ?? 0)),
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : [0, 0, 0, 0],
    category: Number(card.category ?? 0),
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
  };
}

function mergeParsedDraftIntoCard(currentCard: CardDataEntry, parsed: ParsedCardDraft): CardDataEntry {
  const nextCard = {
    ...currentCard,
    name: parsed.name?.trim() || currentCard.name || '',
    desc: parsed.desc?.trim() || currentCard.desc || '',
    code: parsed.code && parsed.code > 0 ? parsed.code : currentCard.code,
    alias: typeof parsed.alias === 'number' ? parsed.alias : currentCard.alias,
    ot: normalizeOt(parsed.ot, Number(currentCard.ot ?? 0)),
    attack: typeof parsed.attack === 'number' ? parsed.attack : currentCard.attack,
    defense: typeof parsed.defense === 'number' ? parsed.defense : currentCard.defense,
    category: typeof parsed.category === 'number' ? parsed.category : currentCard.category,
    setcode: normalizeSetcodes(parsed.setcodes, Array.isArray(currentCard.setcode) ? currentCard.setcode : [0, 0, 0, 0]),
    strings: normalizeStrings(parsed.strings, Array.isArray(currentCard.strings) ? currentCard.strings : []),
  } as CardDataEntry;

  if (parsed.mainType) {
    let typeBits = parsed.mainType === 'monster' ? 0x1 : parsed.mainType === 'spell' ? 0x2 : 0x4;
    for (const subtype of parsed.subtypes ?? []) {
      const bit = SUBTYPE_NAME_TO_BIT[normalizeKeyword(subtype)];
      if (bit) typeBits |= bit;
    }
    nextCard.type = typeBits;
  }

  if (parsed.attribute) {
    nextCard.attribute = ATTRIBUTE_NAME_TO_VALUE[normalizeKeyword(parsed.attribute)] ?? currentCard.attribute;
  }

  if (parsed.race) {
    nextCard.race = RACE_NAME_TO_VALUE[normalizeKeyword(parsed.race)] ?? currentCard.race;
  }

  if (typeof parsed.level === 'number') {
    nextCard.level = parsed.level;
  }

  if (typeof parsed.leftScale === 'number') {
    nextCard.lscale = parsed.leftScale;
  }

  if (typeof parsed.rightScale === 'number') {
    nextCard.rscale = parsed.rightScale;
  }

  if (Array.isArray(parsed.linkMarkers)) {
    nextCard.linkMarker = parsed.linkMarkers.reduce((total, item) => {
      const bit = LINK_MARKER_NAME_TO_BIT[normalizeKeyword(item)];
      return bit ? total | bit : total;
    }, 0);
  }

  return nextCard;
}

function extractTextContent(content: unknown) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .join('\n');
  }

  return '';
}

function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  return JSON.parse(candidate) as T;
}

function getChatCompletionsEndpoint(apiBaseUrl: string) {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}



async function requestChatCompletion(
  config: AiConfig,
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const response = await fetch(getChatCompletionsEndpoint(config.apiBaseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.secretKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `AI request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function finalizeAgentResponse(
  config: AiConfig,
  messages: AiMessage[],
  temperature: number,
  signal?: AbortSignal,
  onStageChange?: (stage: AgentStage) => void,
) {
  onStageChange?.('finalizing_response');
  const payload = await requestChatCompletion(config, {
    model: config.model,
    temperature,
    messages: [
      ...messages,
      {
        role: 'user',
        content: 'Stop calling tools. Using only the gathered context above, return the final answer now.',
      },
    ],
  }, signal);

  const message = payload?.choices?.[0]?.message;
  const text = extractTextContent(message?.content);
  if (!text.trim()) {
    throw new Error('AI returned an empty text response');
  }

  return text;
}

function createAbortError() {
  return new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function getOpenDbMetas(context: AiAppContext): OpenDbMeta[] {
  return context.listOpenDatabases();
}

function getScopedTabs(context: AiAppContext, dbScope: string | undefined, dbPath: string | undefined) {
  const allTabs = context.listOpenDatabases();
  const currentActiveTabId = context.getActiveDatabaseId();

  if (dbPath) {
    return allTabs.filter((tab) => tab.path === dbPath);
  }

  if (dbScope === 'current') {
    return currentActiveTabId ? allTabs.filter((tab) => tab.id === currentActiveTabId) : [];
  }

  return allTabs;
}

async function pickCardFromDb(context: AiAppContext, code: number, dbPath?: string) {
  const matchedTabs = getScopedTabs(context, undefined, dbPath);
  for (const tab of matchedTabs) {
    const card = await context.getCardByIdInTab(tab.id, code);
    if (card) {
      return {
        db: { name: tab.name, path: tab.path },
        card: serializeCardForAi(card),
      };
    }
  }

  if (!dbPath) {
    for (const tab of context.listOpenDatabases()) {
      const card = await context.getCardByIdInTab(tab.id, code);
      if (card) {
        return {
          db: { name: tab.name, path: tab.path },
          card: serializeCardForAi(card),
        };
      }
    }
  }

  return null;
}

function escapeLikeWildcards(value: string) {
  return value.replace(/[%_\\]/g, '\\$&');
}

async function searchCards(context: AiAppContext, query: string, dbScope?: string, dbPath?: string, limit = 6) {
  const normalizedQuery = query.trim();
  const result = [];
  const safeLimit = Math.max(1, Math.min(12, Math.round(limit)));

  for (const tab of getScopedTabs(context, dbScope, dbPath)) {
    const safeLike = normalizedQuery ? `%${escapeLikeWildcards(normalizedQuery)}%` : '';
    const cards = await context.queryCardsRaw(
      tab.id,
      normalizedQuery
        ? `(texts.name LIKE :name OR texts.desc LIKE :name) ORDER BY datas.id LIMIT ${safeLimit}`
        : `1=1 ORDER BY datas.id LIMIT ${safeLimit}`,
      normalizedQuery ? { name: safeLike } : {},
    );

    for (const card of cards) {
      result.push({
        db: { name: tab.name, path: tab.path },
        card: serializeCardForAi(card),
      });
    }
  }

  return result.slice(0, safeLimit);
}

function createToolExecutors(context: AiAppContext, currentCard: CardDataEntry): Record<string, ToolExecutor> {
  return {
    async list_open_databases() {
      return getOpenDbMetas(context);
    },
    async get_current_card() {
      const currentActiveTab = context.listOpenDatabases().find((tab) => tab.id === context.getActiveDatabaseId()) ?? null;
      return {
        db: currentActiveTab
          ? {
              name: currentActiveTab.name,
              path: currentActiveTab.path,
            }
          : null,
        card: serializeCardForAi(currentCard),
      };
    },
    async get_card_by_id(args) {
      const code = Number(args.code ?? 0);
      if (!Number.isInteger(code) || code <= 0) {
        throw new Error('A positive card id is required');
      }

      return pickCardFromDb(context, code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    },
    async search_cards(args) {
      return searchCards(
        context,
        typeof args.query === 'string' ? args.query : '',
        typeof args.dbScope === 'string' ? args.dbScope : undefined,
        typeof args.dbPath === 'string' ? args.dbPath : undefined,
        Number(args.limit ?? 6),
      );
    },
    async read_card_script(args) {
      const fallbackCode = Number(currentCard.code ?? 0);
      const code = Number(args.code ?? fallbackCode);
      if (!Number.isInteger(code) || code <= 0) {
        throw new Error('A positive card id is required');
      }

      return context.readCardScript(code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    },
  };
}

async function runAgent(options: {
  context: AiAppContext;
  currentCard: CardDataEntry;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  useTools?: boolean;
  maxSteps?: number;
  toolNames?: string[];
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
}) {
  const config = await options.context.getAiConfig();
  const messages: AiMessage[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt },
  ];
  const temperature = options.temperature ?? config.temperature;
  const maxSteps = Math.max(1, Math.min(MAX_AGENT_STEPS, Math.floor(options.maxSteps ?? MAX_AGENT_STEPS)));
  const allowedTools = options.useTools
    ? TOOL_DEFINITIONS.filter((tool) => !options.toolNames || options.toolNames.includes(tool.function.name))
    : [];
  const canUseTools = allowedTools.length > 0;

  const executors = createToolExecutors(options.context, options.currentCard);
  let lastToolSignature = '';
  let repeatedToolRoundCount = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    throwIfAborted(options.signal);
    options.onStageChange?.('requesting_model');
    const payload = await requestChatCompletion(config, {
      model: config.model,
      temperature,
      messages,
      ...(canUseTools
        ? {
            tools: allowedTools,
            tool_choice: 'auto',
          }
        : {}),
    }, options.signal);

    const message = payload?.choices?.[0]?.message;
    if (!message) {
      throw new Error('AI returned an empty response');
    }

    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (canUseTools && toolCalls.length > 0) {
      const toolSignature = JSON.stringify(
        toolCalls.map((toolCall: NonNullable<AiMessage['tool_calls']>[number]) => ({
          name: toolCall.function.name,
          arguments: toolCall.function.arguments ?? '',
        })),
      );
      if (toolSignature === lastToolSignature) {
        repeatedToolRoundCount += 1;
      } else {
        lastToolSignature = toolSignature;
        repeatedToolRoundCount = 0;
      }

      if (repeatedToolRoundCount >= 1) {
        break;
      }

      options.onStageChange?.('running_tools');
      messages.push({
        role: 'assistant',
        content: extractTextContent(message.content),
        tool_calls: toolCalls,
      });

      const toolResults = await Promise.all(toolCalls.map(async (toolCall: NonNullable<AiMessage['tool_calls']>[number]) => {
        const executor = executors[toolCall.function.name];
        if (!executor) {
          return {
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` }),
          };
        }

        try {
          const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
          throwIfAborted(options.signal);
          const result = await executor(args);
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          } as const;
        } catch (error) {
          return {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: error instanceof Error ? error.message : 'Tool execution failed',
            }),
          } as const;
        }
      }));

      for (const toolResult of toolResults) {
        messages.push(toolResult);
      }

      continue;
    }

    const text = extractTextContent(message.content);
    if (!text.trim()) {
      throw new Error('AI returned an empty text response');
    }

    return text;
  }

  if (canUseTools) {
    return finalizeAgentResponse(config, messages, temperature, options.signal, options.onStageChange);
  }

  throw new Error('AI exceeded the maximum tool-call steps');
}

export async function parseCardManuscript(manuscript: string, currentCard: CardDataEntry, context: AiAppContext) {
  const text = await runAgent({
    context,
    currentCard,
    useTools: true,
    systemPrompt: [
      'You are a Yu-Gi-Oh! card data editor assistant.  Your task is to parse',
      'free-form card manuscript text into structured card records.',
      '',
      '## Available tools',
      'You may call tools to inspect the current card and opened databases',
      'before producing the final JSON output.',
      'Use only the minimum number of tool rounds you need, then return the final JSON.',
      '',
      '## Output format',
      'Return **only** a JSON object (no markdown fences, no explanation).',
      '',
      '### Top-level schema',
      '{',
      '  "cards": [ ...one or more CardDraft objects... ],',
      '  "summary": "brief description of what was parsed"',
      '}',
      '',
      '### CardDraft schema',
      '{',
      '  "code": number | null,          // card password / id',
      '  "alias": number | null,         // alias id (for alternative artwork, etc.)',
      '  "name": string,                 // card name',
      '  "desc": string,                 // card effect / flavor text',
      '  "ot": number | string | null,   // 1=OCG, 2=TCG, 3=OCG/TCG, 4=Custom, 9=SC, 11=SC/TCG',
      '  "mainType": "monster" | "spell" | "trap" | null,',
      '  "subtypes": string[],           // see allowed subtype names below',
      '  "attribute": string | null,     // see allowed attribute names below',
      '  "race": string | null,          // see allowed race names below',
      '  "level": number | null,         // monster level / rank (1-13)',
      '  "leftScale": number | null,     // pendulum left scale (0-13)',
      '  "rightScale": number | null,    // pendulum right scale (0-13)',
      '  "attack": number | null,        // ATK value (-2 means "?")',
      '  "defense": number | null,       // DEF value (-2 means "?", link monsters have 0)',
      '  "linkMarkers": string[],        // see marker names below',
      '  "setcodes": (string|number)[],  // up to 4 archetype setcodes as hex strings e.g. "0x00a1"',
      '  "category": number | null,      // category bitmask (rarely used)',
      '  "strings": string[]             // up to 16 counter/prompt strings',
      '}',
      '',
      '### Allowed field values',
      '- **subtypes** (monster): normal, effect, fusion, ritual, spirit, union, gemini,',
      '  tuner, synchro, token, flip, toon, xyz, pendulum, spssummon, link',
      '- **subtypes** (spell): quickplay, continuous, equip, field, ritual_spell',
      '- **subtypes** (trap): continuous, counter',
      '- **attribute**: earth, water, fire, wind, light, dark, divine',
      '- **race**: warrior, spellcaster, fairy, fiend, zombie, machine, aqua, pyro,',
      '  rock, wingedbeast, plant, insect, thunder, dragon, beast, beastwarrior,',
      '  dinosaur, fish, seaserpent, reptile, psychic, divinebeast, creatorgod,',
      '  wyrm, cyberse, illusion',
      '- **linkMarkers**: up, down, left, right, upleft, upright, downleft, downright',
      '',
      '## Rules',
      '1. If the manuscript contains multiple cards, return them in order.',
      '2. When the manuscript omits a field, set it to null — do NOT guess.',
      '3. Use English keywords for semantic fields (subtypes, attribute, race, etc.).',
      '4. For Link Monsters, defense should be 0 and include linkMarkers.',
      '5. desc should preserve the original line breaks from the manuscript.',
      '6. setcodes should be hex strings like "0x00a1" or integers.',
    ].join('\n'),
    userPrompt: [
      'Parse the following manuscript into one or more editable card records.',
      'If the manuscript is incomplete, preserve only what can be inferred confidently.',
      '',
      `Current card draft (for context / fallback fields):`,
      JSON.stringify(serializeCardForAi(currentCard)),
      '',
      '--- MANUSCRIPT ---',
      manuscript,
    ].join('\n'),
  });

  const parsed = parseJsonFromText<{ cards?: ParsedCardDraft[]; card?: ParsedCardDraft; summary?: string }>(text);
  const draftCards = Array.isArray(parsed.cards) && parsed.cards.length > 0
    ? parsed.cards
    : parsed.card
      ? [parsed.card]
      : [];

  return {
    cards: draftCards.map((item, index) => mergeParsedDraftIntoCard(index === 0 ? currentCard : createEmptyCard(), item ?? {})),
    summary: parsed.summary ?? '',
    raw: text,
  };
}
/**
 * Pre-fetches up to `maxScripts` reference Lua scripts from opened databases
 * by searching for cards similar to `currentCard`. This runs locally and is
 * fast, so we can embed the results directly in the AI prompt and skip
 * tool-call round-trips entirely.
 */
async function prefetchReferenceScripts(
  context: AiAppContext,
  currentCard: CardDataEntry,
  maxScripts = 2,
  signal?: AbortSignal,
): Promise<{ code: number; name: string; script: string }[]> {
  const results: { code: number; name: string; script: string }[] = [];
  const seenCodes = new Set<number>();
  const currentCode = Number(currentCard.code ?? 0);
  if (currentCode > 0) seenCodes.add(currentCode);

  // Strategy 1: Search by card name keywords
  const cardName = String(currentCard.name ?? '').trim();
  if (cardName) {
    // Extract the first meaningful keyword (skip single-char words)
    const keywords = cardName.split(/[\s・・/／]+/).filter((w) => w.length >= 2);
    const searchTerm = keywords[0] ?? cardName.slice(0, 4);
    throwIfAborted(signal);
    const found = await searchCards(context, searchTerm, 'all', undefined, 4);
    for (const item of found) {
      throwIfAborted(signal);
      if (results.length >= maxScripts) break;
      const code = Number(item.card?.code ?? 0);
      if (code <= 0 || seenCodes.has(code)) continue;
      // Only consider cards that have effect text (not normal monsters)
      if (!item.card?.desc) continue;
      seenCodes.add(code);
      throwIfAborted(signal);
      const scriptResult = await context.readCardScript(code, item.db?.path);
      if (scriptResult.exists && scriptResult.content) {
        results.push({ code, name: String(item.card?.name ?? ''), script: scriptResult.content });
      }
    }
  }

  // Strategy 2: If we still need more, search by card description keywords
  if (results.length < maxScripts) {
    const desc = String(currentCard.desc ?? '').trim();
    // Extract a short effect keyword from the description
    const effectKeywords = desc.match(/(?:特殊召喚|破壊|除外|墓地|ドロー|無効|Special Summon|destroy|negate|draw|banish)/i);
    const fallbackSearch = effectKeywords?.[0] ?? '';
    if (fallbackSearch) {
      throwIfAborted(signal);
      const found = await searchCards(context, fallbackSearch, 'all', undefined, 4);
      for (const item of found) {
        throwIfAborted(signal);
        if (results.length >= maxScripts) break;
        const code = Number(item.card?.code ?? 0);
        if (code <= 0 || seenCodes.has(code)) continue;
        if (!item.card?.desc) continue;
        seenCodes.add(code);
        throwIfAborted(signal);
        const scriptResult = await context.readCardScript(code, item.db?.path);
        if (scriptResult.exists && scriptResult.content) {
          results.push({ code, name: String(item.card?.name ?? ''), script: scriptResult.content });
        }
      }
    }
  }

  return results;
}

export async function generateCardScript(currentCard: CardDataEntry, options: {
  context: AiAppContext;
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
}) {
  // Pre-fetch reference scripts locally — this is fast and avoids slow
  // AI tool-call round-trips (each round-trip is ~3-10s).
  options.onStageChange?.('collecting_references');
  const referenceScripts = await prefetchReferenceScripts(options.context, currentCard, 2, options.signal);

  const referenceSection = referenceScripts.length > 0
    ? [
        '',
        '## Reference scripts (from opened databases)',
        'Use these as style/pattern references. Do NOT copy them verbatim — adapt to the current card.',
        ...referenceScripts.map((ref, i) => [
          `### Reference ${i + 1}: ${ref.name} (id: ${ref.code})`,
          '```lua',
          ref.script.length > 3000 ? ref.script.slice(0, 3000) + '\n-- [truncated]' : ref.script,
          '```',
        ].join('\n')),
      ].join('\n')
    : '';

  return runAgent({
    context: options.context,
    currentCard,
    useTools: true,
    maxSteps: 3,
    toolNames: ['search_cards', 'read_card_script'],
    signal: options.signal,
    onStageChange: options.onStageChange,
    systemPrompt: [
      'You are an expert EDOPro/YGOPro Lua card scripter.',
      'Generate a complete, runnable Lua script for the current Yu-Gi-Oh! card.',
      '',
      '## Tool usage',
      'Reference scripts have already been pre-fetched and included in the prompt.',
      'Only call tools if the pre-fetched references are insufficient and you need',
      'a very specific card script not already provided. In most cases, do NOT call any tools.',
      '',
      '## Output format',
      'Return only the final Lua script.',
      'Do not use markdown fences or any explanation.',
      'If the card text is ambiguous, keep the script runnable and add brief Lua TODO comments only where needed.',
      '',
      '## Important conventions',
      '- Always start with `local s,id=GetID()` or equivalent valid EDOPro style.',
      '- Use the `s.` prefix for helper functions.',
      '- Register complete effects with proper condition/cost/target/operation functions.',
      '- Use `e:SetCountLimit(1,id)` for hard once-per-turn when appropriate.',
      '- Use correct summon procedures and helpers for Fusion/Synchro/Xyz/Link/Pendulum cards.',
      '- Keep the script runnable; avoid placeholder pseudocode.',
      '',
      '## Type-specific guidelines',
      '- Normal Monster: minimal script is acceptable.',
      '- Spell/Trap: use activation effects and proper event codes.',
      '- Pendulum: include scale-side effects when the text requires them.',
      '- Link Monster: do not invent DEF-related logic.',
    ].join('\n'),
    userPrompt: [
      'Generate the complete Lua script for the current card.',
      '',
      'Current card data:',
      JSON.stringify(serializeCardForAi(currentCard)),
      referenceSection,
      '',
      'Return only the finished Lua code.',
    ].join('\n'),
  });
}

export async function translateCardImageFields(input: {
  context: AiAppContext;
  currentCard: CardDataEntry;
  targetLanguage: string;
  name: string;
  monsterType: string;
  description: string;
  pendulumDescription: string;
}) {
  const text = await runAgent({
    context: input.context,
    currentCard: input.currentCard,
    useTools: false,
    systemPrompt: [
      'You are a Yu-Gi-Oh! card localization assistant.',
      'Your task is to translate card text fields for card image rendering.',
      '',
      '## Output format',
      'Return **only** a JSON object (no markdown fences, no explanation).',
      'Schema: {"name":string, "monsterType":string, "description":string, "pendulumDescription":string}',
      '',
      '## Rules',
      '1. Preserve line breaks (\\n) exactly as they appear in the source.',
      '2. Preserve card-game specific formatting and punctuation:',
      '   - Effect separators like ●, ①, ②',
      '   - Card name references in 「」 or quotation marks',
      '   - Bullet points and numbered lists',
      '3. Do NOT translate empty strings — return "" for empty fields.',
      '4. Use official Yu-Gi-Oh! terminology in the target language.',
      '5. monsterType is the type line on the card, e.g. "効果モンスター" or "Effect Monster".',
      '',
      '## Japanese-specific rules (target language = 日本語)',
      'When translating to Japanese, you MUST add furigana (reading) to all kanji.',
      'Use the per-character ruby format: `[漢(かん)][字(じ)]`',
      '',
      'This means:',
      '- Each kanji character gets its OWN `[character(reading)]` annotation.',
      '- Do NOT group multiple kanji into one annotation.',
      '- Hiragana, katakana, numbers, and symbols do NOT need annotations.',
      '',
      'Examples:',
      '- 魔法使い → [魔(ま)][法(ほう)][使(つか)]い',
      '- 闇属性 → [闇(やみ)][属(ぞく)][性(せい)]',
      '- 効果モンスター → [効(こう)][果(か)]モンスター',
      '- 破壊する → [破(は)][壊(かい)]する',
      '- 特殊召喚 → [特(とく)][殊(しゅ)][召(しょう)][喚(かん)]',
      '- 墓地へ送る → [墓(ぼ)][地(ち)]へ[送(おく)]る',
      '- 「ブラック・マジシャン」 → 「ブラック・マジシャン」',
      '- このカードの①②の効果は1ターンに1度 → このカードの①②の[効(こう)][果(か)]は1ターンに1[度(ど)]',
      '',
      'Apply this rule to ALL text fields: name, monsterType, description, and pendulumDescription.',
    ].join('\n'),
    userPrompt: [
      `Translate the following card image fields into ${input.targetLanguage}.`,
      'Use natural Yu-Gi-Oh! terminology for the target language.',
      '',
      JSON.stringify({
        name: input.name,
        monsterType: input.monsterType,
        description: input.description,
        pendulumDescription: input.pendulumDescription,
      }),
    ].join('\n'),
  });

  return parseJsonFromText<{
    name: string;
    monsterType: string;
    description: string;
    pendulumDescription: string;
  }>(text);
}

