import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { createEmptyCard } from '$lib/domain/card/draft';
import { normalizeGeneratedScript } from '$lib/domain/script/workspace';
import {
  ATTRIBUTE_MAP,
  LINK_MARKER_NAME_TO_BIT,
  RACE_MAP,
  SUBTYPE_MAP,
} from '$lib/domain/card/taxonomy';
import {
  analyzeLuaScript,
  ensureLuaDiagnosticsCatalogLoaded,
  type LuaScriptDiagnostic,
} from '$lib/utils/luaScriptDiagnostics';

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
const MAX_SCRIPT_DIAGNOSTICS = 8;

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

  const initialScript = normalizeGeneratedScript(await runAgent({
    context: options.context,
    currentCard,
    useTools: true,
    maxSteps: 3,
    toolNames: ['search_cards', 'read_card_script'],
    signal: options.signal,
    onStageChange: options.onStageChange,
    systemPrompt: buildScriptGenerationSystemPrompt(),
    userPrompt: [
      '请为当前卡片生成完整 Lua 脚本。',
      '先基于结构化卡片数据识别卡种、效果数量、发动位置、是否取对象、是否有次数限制，再给出最终脚本。',
      '如果参考脚本与当前卡片不完全一致，应借鉴写法而不是机械照抄。',
      '',
      'Current card data:',
      JSON.stringify(serializeCardForAi(currentCard)),
      referenceSection,
      '',
      '直接返回最终 Lua 代码。',
    ].join('\n'),
  }));

  await ensureLuaDiagnosticsCatalogLoaded();
  const initialDiagnostics = analyzeLuaScript(initialScript);
  if (initialDiagnostics.length === 0) {
    return initialScript;
  }

  const repairedScript = normalizeGeneratedScript(await repairGeneratedCardScript({
    context: options.context,
    currentCard,
    initialScript,
    diagnostics: initialDiagnostics,
    signal: options.signal,
    onStageChange: options.onStageChange,
  }));
  const repairedDiagnostics = analyzeLuaScript(repairedScript);

  return getDiagnosticScore(repairedDiagnostics) <= getDiagnosticScore(initialDiagnostics)
    ? repairedScript
    : initialScript;
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

function formatLuaDiagnosticsForPrompt(diagnostics: LuaScriptDiagnostic[]) {
  return diagnostics
    .slice(0, MAX_SCRIPT_DIAGNOSTICS)
    .map((diagnostic, index) => (
      `${index + 1}. [${diagnostic.severity}] ` +
      `L${diagnostic.startLineNumber}:C${diagnostic.startColumn} ` +
      `${diagnostic.message}`
    ))
    .join('\n');
}

function getDiagnosticScore(diagnostics: LuaScriptDiagnostic[]) {
  return diagnostics.reduce((score, diagnostic) => (
    score + (diagnostic.severity === 'error' ? 100 : 1)
  ), 0);
}

function buildScriptGenerationSystemPrompt() {
  return [
    '你是一个专业的 YGOPro / EDOPro Lua 脚本编写专家。',
    '你的任务是根据当前卡片的结构化数据、效果文本、已打开数据库中的参考卡片与参考脚本，生成一份完整、可运行、尽量贴近官方写法的 Lua 脚本。',
    '',
    '## 输出要求',
    '- 只输出纯 Lua 代码。',
    '- 不要输出 Markdown 包裹、解释、标题或额外说明。',
    '- 如果文本存在歧义，优先保证脚本可运行，并仅在必要位置加入简短的 Lua TODO 注释。',
    '',
    '## 基本结构',
    '- 默认使用如下结构：卡名注释、`local s,id=GetID()`、`function s.initial_effect(c)`、其余辅助函数统一用 `s.xxx`。',
    '- 所有效果都应在 `s.initial_effect(c)` 中创建并注册。',
    '- 除非卡片文本明确需要，否则不要写无意义的空函数、假代码或占位逻辑。',
    '',
    '## Tool usage',
    '- 参考脚本通常已经预取并附在提示词里，应优先使用这些上下文。',
    '- 只有当预取的参考不足以判断具体实现时，才调用工具继续查询。',
    '- 如果要查询，优先搜索相似效果卡，再读取其脚本。',
    '',
    '## 效果类型与注册方式',
    '- 起动效果通常使用 `EFFECT_TYPE_IGNITION`，并设置正确的 `SetRange`。',
    '- 单体诱发效果通常使用 `EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O` 或 `TRIGGER_F`。',
    '- 场上诱发效果通常使用 `EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O/F`，并补充正确的 `SetRange` 与影响区域。',
    '- 速攻效果通常使用 `EFFECT_TYPE_QUICK_O` / `EFFECT_TYPE_QUICK_F`，必要时加入 `SetHintTiming`。',
    '- 永续类效果通常使用 `SetValue`，而不是错误地写成 `SetOperation`。',
    '- 魔法陷阱发动效果通常使用 `EFFECT_TYPE_ACTIVATE` + `SetCode(EVENT_FREE_CHAIN)` 或对应触发事件。',
    '',
    '## 常见事件代码',
    '- `EVENT_SUMMON_SUCCESS` / `EVENT_SPSUMMON_SUCCESS` / `EVENT_FLIP_SUMMON_SUCCESS`：召唤成功。',
    '- `EVENT_TO_GRAVE` / `EVENT_REMOVE` / `EVENT_DESTROY` / `EVENT_LEAVE_FIELD`：离场或移动。',
    '- `EVENT_TO_HAND` / `EVENT_BE_MATERIAL` / `EVENT_BATTLE_DESTROYING`：特殊移动或战斗事件。',
    '- `EVENT_PHASE+PHASE_STANDBY` / `EVENT_PHASE+PHASE_END`：阶段效果。',
    '- `EVENT_FREE_CHAIN`：自由时点；`EVENT_CHAINING`：连锁相关触发。',
    '',
    '## cost / target / operation 约定',
    '- `cost`、`target`、`operation` 的参数必须符合 YGOPro 约定签名。',
    '- `chk==0` 分支只能做可行性检查，不能选择卡、移动卡、支付代价或修改状态。',
    '- 取对象效果需要 `EFFECT_FLAG_CARD_TARGET`，并在 `target` 中正确处理 `chkc`。',
    '- 不取对象效果不要伪造 `chkc` 或 `SelectTarget`。',
    '- `operation` 中如果依赖已取对象，必须检查 `tc and tc:IsRelateToEffect(e)`。',
    '- 从卡组加入手卡后，通常需要 `Duel.ConfirmCards(1-tp,g)`。',
    '',
    '## SetProperty 与次数限制',
    '- 需要取对象时使用 `EFFECT_FLAG_CARD_TARGET`。',
    '- 从非公开区域诱发时，经常需要 `EFFECT_FLAG_DELAY`。',
    '- 伤害步骤可发动时补充 `EFFECT_FLAG_DAMAGE_STEP` 或相关时点限制。',
    '- “每回合1次” 与 “此卡名的效果每回合只能使用1次” 要区分好 `SetCountLimit(1)`、`SetCountLimit(1,id)`、`SetCountLimit(1,id+1)`、`SetCountLimit(1,id+EFFECT_COUNT_CODE_OATH)` 等形式。',
    '',
    '## 常用 API 习惯',
    '- 取对象检查用 `Duel.IsExistingTarget`，取对象选择用 `Duel.SelectTarget`。',
    '- 不取对象检查用 `Duel.IsExistingMatchingCard`，不取对象选择用 `Duel.SelectMatchingCard`。',
    '- 常见移动 API 包括 `Duel.Destroy`、`Duel.SendtoGrave`、`Duel.Remove`、`Duel.SendtoHand`、`Duel.SendtoDeck`、`Duel.SpecialSummon`。',
    '- 常见提示 API 包括 `Duel.Hint(HINT_SELECTMSG,...)` 与正确的 `HINTMSG_*` 常量。',
    '- 效果描述通常用 `aux.Stringid(id,n)`，`n` 与 `str1/str2/...` 顺序对应。',
    '',
    '## 类型专项规则',
    '- 通常怪兽没有效果时，最小可运行脚本即可，不要硬加无关效果。',
    '- 效果怪兽要完整拆出 condition/cost/target/operation，不要把复杂逻辑全部塞进一个函数里。',
    '- 魔法/陷阱卡优先关注发动时点、分类、是否取对象，以及发动后是否还需要永续效果。',
    '- 永续魔法/陷阱常常需要“发动效果 + 持续效果”两部分。',
    '- 装备魔法通常需要 `EFFECT_TYPE_EQUIP` 与 `EFFECT_EQUIP_LIMIT` 等相关处理。',
    '- 反击陷阱通常围绕 `EVENT_CHAINING` 和对 `re`、`rp`、连锁状态的判断。',
    '- 灵摆卡需要同时考虑怪兽效果与灵摆区域效果。',
    '- Link 怪兽不要编造 DEF 相关逻辑。',
    '',
    '## 易错点',
    '- 不要在 `chk==0` 里做副作用。',
    '- 不要把 COST 和 EFFECT 的 reason 混用。',
    '- 不要遗漏 `SetRange`，特别是手卡/墓地发动的效果。',
    '- 不要把“取对象效果”写成“非取对象效果”，反之亦然。',
    '- 不要遗漏 `SetCategory`、`SetCode`、`SetProperty`、`SetHintTiming` 中真正影响行为的部分。',
    '- 不要调用不存在的 API，也不要臆造辅助函数名。',
    '- 若引用对象卡，注意控制者、位置、数量限制与时点合法性。',
    '',
    '## 生成策略',
    '1. 先读懂当前卡的效果文本，拆分出每个独立效果。',
    '2. 优先参考已提供的相似脚本风格与实现模式，但不要逐字照抄。',
    '3. 缺信息时再调用工具补查相似脚本或相关卡。',
    '4. 输出前自行检查脚本结构、API 调用、参数数量、对象合法性和回合限制写法。',
    '',
    '## 最终目标',
    '- 生成的代码必须优先保证“可运行、结构清晰、贴近 YGOPro 习惯写法、尽量忠于文本”。',
  ].join('\n');
}

function buildScriptRepairSystemPrompt() {
  return [
    '你是一个专业的 YGOPro / EDOPro Lua 脚本修复专家。',
    '你会收到一份已生成的脚本，以及本地静态检查器给出的诊断结果。',
    '你的任务是在尽量保留原有正确逻辑的前提下，修复脚本中的结构、语法、API 调用和参数问题。',
    '',
    '## 输出要求',
    '- 只输出修复后的纯 Lua 代码。',
    '- 不要输出解释或 Markdown。',
    '',
    '## 修复原则',
    '- 优先修复所有 error，其次尽量消除 warning。',
    '- 尽量最小改动，不要为了修一个小问题把整份脚本改写成另一种风格。',
    '- 保持卡片效果语义不变，不要因为图省事而删除真实需要的效果。',
    '- 不要引入新的不存在 API 或新的参数错误。',
    '- 保持 `s.initial_effect(c)`、辅助函数命名、目标/对象处理、次数限制、时点和 reason 的正确性。',
    '- 如果脚本确实结构性错误严重，可以重写局部或整体，但仍要忠于当前卡片数据。',
  ].join('\n');
}

async function repairGeneratedCardScript(input: {
  context: AiAppContext;
  currentCard: CardDataEntry;
  initialScript: string;
  diagnostics: LuaScriptDiagnostic[];
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
}) {
  return runAgent({
    context: input.context,
    currentCard: input.currentCard,
    useTools: false,
    signal: input.signal,
    onStageChange: input.onStageChange,
    systemPrompt: buildScriptRepairSystemPrompt(),
    userPrompt: [
      '请根据下面的本地静态检查诊断结果修复这份已生成脚本。',
      '优先修复真正影响可运行性的结构、语法、API 和参数问题，并尽量保留原来的正确逻辑与函数划分。',
      '',
      'Current card data:',
      JSON.stringify(serializeCardForAi(input.currentCard)),
      '',
      'Diagnostics:',
      formatLuaDiagnosticsForPrompt(input.diagnostics),
      '',
      'Current script:',
      '```lua',
      input.initialScript,
      '```',
      '',
      '直接返回修复后的 Lua 代码。',
    ].join('\n'),
  });
}

