import { get } from 'svelte/store';
import type { CardDataEntry } from '$lib/types';
import { cloneEditableCard, createCardSnapshot, createEmptyCard } from '$lib/domain/card/draft';
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
  getSelectedCardsInActiveTab: () => CardDataEntry[];
  getVisibleCardsInActiveTab: () => CardDataEntry[];
  modifyCardsWithSnapshotInTab: (
    tabId: string,
    cards: CardDataEntry[],
    previousCards: Array<CardDataEntry | null | undefined>,
  ) => Promise<boolean>;
  deleteCardsWithSnapshotInTab: (
    tabId: string,
    cardIds: number[],
    deletedCards: CardDataEntry[],
  ) => Promise<boolean>;
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

type BatchTargetScope = 'current_selection' | 'current_page' | 'all_cards' | 'search_query' | 'card_ids';

type BatchTarget = {
  scope?: BatchTargetScope;
  dbPath?: string;
  query?: string;
  queryFields?: string[];
  cardIds?: number[];
  limit?: number;
};

type BatchOperation =
  | {
      type: 'set_fields';
      patch?: ParsedCardDraft;
    }
  | {
      type: 'append_text' | 'prepend_text';
      textField?: 'name' | 'desc';
      value?: string;
    }
  | {
      type: 'replace_text';
      textField?: 'name' | 'desc';
      findText?: string;
      replaceText?: string;
      matchCase?: boolean;
    }
  | {
      type: 'delete_cards';
    };

type BatchEditArgs = {
  target?: BatchTarget;
  operation?: BatchOperation;
  dryRun?: boolean;
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
      name: 'get_current_selection',
      description: 'Get the cards currently selected in the active card list. Returns the count plus a small sample only.',
      parameters: {
        type: 'object',
        properties: {
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
  {
    type: 'function',
    function: {
      name: 'apply_batch_card_edit',
      description: 'Apply a batch card operation inside the active or specified opened database and return only counts plus a small sample.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: ['current_selection', 'current_page', 'all_cards', 'search_query', 'card_ids'],
              },
              dbPath: { type: 'string' },
              query: { type: 'string' },
              queryFields: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['name', 'desc'],
                },
              },
              cardIds: {
                type: 'array',
                items: { type: 'number' },
              },
              limit: { type: 'number' },
            },
            additionalProperties: false,
          },
          operation: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['set_fields', 'append_text', 'prepend_text', 'replace_text', 'delete_cards'],
              },
              patch: {
                type: 'object',
                properties: {
                  code: { type: 'number' },
                  alias: { type: 'number' },
                  name: { type: 'string' },
                  desc: { type: 'string' },
                  ot: { type: ['number', 'string'] },
                  mainType: { type: 'string', enum: ['monster', 'spell', 'trap'] },
                  subtypes: { type: 'array', items: { type: 'string' } },
                  attribute: { type: 'string' },
                  race: { type: 'string' },
                  level: { type: 'number' },
                  leftScale: { type: 'number' },
                  rightScale: { type: 'number' },
                  attack: { type: 'number' },
                  defense: { type: 'number' },
                  linkMarkers: { type: 'array', items: { type: 'string' } },
                  setcodes: {
                    type: 'array',
                    items: {
                      anyOf: [{ type: 'string' }, { type: 'number' }],
                    },
                  },
                  category: { type: 'number' },
                  strings: { type: 'array', items: { type: 'string' } },
                },
                additionalProperties: false,
              },
              textField: { type: 'string', enum: ['name', 'desc'] },
              value: { type: 'string' },
              findText: { type: 'string' },
              replaceText: { type: 'string' },
              matchCase: { type: 'boolean' },
            },
            additionalProperties: false,
          },
          dryRun: { type: 'boolean' },
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

function normalizeBatchTarget(raw: Record<string, unknown> | undefined): BatchTarget {
  const scope = typeof raw?.scope === 'string' ? raw.scope as BatchTargetScope : 'current_selection';
  return {
    scope,
    dbPath: typeof raw?.dbPath === 'string' ? raw.dbPath : undefined,
    query: typeof raw?.query === 'string' ? raw.query : undefined,
    queryFields: Array.isArray(raw?.queryFields) ? raw.queryFields.map((value) => String(value)) : undefined,
    cardIds: Array.isArray(raw?.cardIds)
      ? raw.cardIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
      : undefined,
    limit: Number.isFinite(Number(raw?.limit)) ? Number(raw?.limit) : undefined,
  };
}

function normalizeBatchOperation(raw: Record<string, unknown> | undefined): BatchOperation {
  const type = typeof raw?.type === 'string' ? raw.type : 'set_fields';
  if (type === 'append_text' || type === 'prepend_text') {
    return {
      type,
      textField: raw?.textField === 'name' ? 'name' : 'desc',
      value: typeof raw?.value === 'string' ? raw.value : '',
    };
  }

  if (type === 'replace_text') {
    return {
      type,
      textField: raw?.textField === 'name' ? 'name' : 'desc',
      findText: typeof raw?.findText === 'string' ? raw.findText : '',
      replaceText: typeof raw?.replaceText === 'string' ? raw.replaceText : '',
      matchCase: Boolean(raw?.matchCase),
    };
  }

  if (type === 'delete_cards') {
    return { type };
  }

  return {
    type: 'set_fields',
    patch: raw?.patch && typeof raw.patch === 'object'
      ? raw.patch as ParsedCardDraft
      : {},
  };
}

function resolveTabMeta(context: AiAppContext, dbPath?: string) {
  const opened = context.listOpenDatabases();
  if (dbPath) {
    return opened.find((tab) => tab.path === dbPath) ?? null;
  }

  const activeId = context.getActiveDatabaseId();
  if (activeId) {
    return opened.find((tab) => tab.id === activeId) ?? null;
  }

  return opened[0] ?? null;
}

function limitBatchCards(cards: CardDataEntry[], limit: number | undefined) {
  if (!Number.isFinite(limit) || (limit ?? 0) <= 0) {
    return cards;
  }

  return cards.slice(0, Math.floor(limit as number));
}

async function queryCardsByIds(context: AiAppContext, tabId: string, cardIds: number[]) {
  const safeIds = [...new Set(cardIds.filter((value) => Number.isInteger(value) && value > 0))];
  if (safeIds.length === 0) {
    return [];
  }

  return context.queryCardsRaw(tabId, `datas.id IN (${safeIds.join(',')}) ORDER BY datas.id`);
}

async function collectBatchTargetCards(context: AiAppContext, target: BatchTarget) {
  const tab = resolveTabMeta(context, target.dbPath);
  if (!tab) {
    throw new Error('No opened database is available');
  }

  switch (target.scope) {
    case 'current_page':
      return {
        tab,
        cards: limitBatchCards(context.getVisibleCardsInActiveTab(), target.limit),
      };
    case 'all_cards':
      return {
        tab,
        cards: limitBatchCards(
          await context.queryCardsRaw(tab.id, '1=1 ORDER BY datas.id'),
          target.limit,
        ),
      };
    case 'search_query': {
      const query = String(target.query ?? '').trim();
      if (!query) {
        throw new Error('A non-empty search query is required');
      }

      const queryFields = (target.queryFields ?? ['name', 'desc']).filter((field) => field === 'name' || field === 'desc');
      if (queryFields.length === 0) {
        throw new Error('At least one search field is required');
      }

      const safeLike = `%${escapeLikeWildcards(query)}%`;
      const fieldClause = queryFields
        .map((field) => field === 'name' ? 'texts.name LIKE :query ESCAPE \'\\\'' : 'texts.desc LIKE :query ESCAPE \'\\\'')
        .join(' OR ');
      const limitClause = Number.isFinite(target.limit) && (target.limit ?? 0) > 0
        ? ` LIMIT ${Math.floor(target.limit as number)}`
        : '';

      return {
        tab,
        cards: await context.queryCardsRaw(
          tab.id,
          `(${fieldClause}) ORDER BY datas.id${limitClause}`,
          { query: safeLike },
        ),
      };
    }
    case 'card_ids':
      return {
        tab,
        cards: limitBatchCards(
          await queryCardsByIds(context, tab.id, target.cardIds ?? []),
          target.limit,
        ),
      };
    case 'current_selection':
    default:
      return {
        tab,
        cards: limitBatchCards(context.getSelectedCardsInActiveTab(), target.limit),
      };
  }
}

function createBatchSample(cards: CardDataEntry[], limit = 8) {
  return cards.slice(0, limit).map((card) => ({
    code: Number(card.code ?? 0),
    name: String(card.name ?? ''),
  }));
}

function replaceLiteralText(
  input: string,
  findText: string,
  replaceText: string,
  matchCase: boolean,
) {
  if (!findText) {
    return input;
  }

  if (matchCase) {
    return input.split(findText).join(replaceText);
  }

  const pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return input.replace(new RegExp(pattern, 'gi'), replaceText);
}

function applyBatchOperationToCard(card: CardDataEntry, operation: BatchOperation) {
  const nextCard = cloneEditableCard(card);

  switch (operation.type) {
    case 'delete_cards':
      return nextCard;
    case 'set_fields':
      return mergeParsedDraftIntoCard(nextCard, operation.patch ?? {});
    case 'append_text':
    case 'prepend_text': {
      const field: 'name' | 'desc' = operation.textField ?? 'desc';
      const value = String(operation.value ?? '');
      nextCard[field] = operation.type === 'append_text'
        ? `${nextCard[field] ?? ''}${value}`
        : `${value}${nextCard[field] ?? ''}`;
      return nextCard;
    }
    case 'replace_text': {
      const field: 'name' | 'desc' = operation.textField ?? 'desc';
      nextCard[field] = replaceLiteralText(
        String(nextCard[field] ?? ''),
        String(operation.findText ?? ''),
        String(operation.replaceText ?? ''),
        Boolean(operation.matchCase),
      );
      return nextCard;
    }
    default:
      return nextCard;
  }
}

async function applyBatchCardEdit(context: AiAppContext, args: BatchEditArgs) {
  const target = normalizeBatchTarget(args.target as Record<string, unknown> | undefined);
  const operation = normalizeBatchOperation(args.operation as Record<string, unknown> | undefined);
  const dryRun = Boolean(args.dryRun);
  const { tab, cards } = await collectBatchTargetCards(context, target);

  if (cards.length === 0) {
    return {
      db: { name: tab.name, path: tab.path },
      matchedCount: 0,
      changedCount: 0,
      dryRun,
      operation: operation.type,
      sample: [],
    };
  }

  if (operation.type === 'delete_cards') {
    if (!dryRun) {
      const ok = await context.deleteCardsWithSnapshotInTab(
        tab.id,
        cards.map((card) => card.code),
        cards,
      );
      if (!ok) {
        throw new Error('Failed to delete cards');
      }
    }

    return {
      db: { name: tab.name, path: tab.path },
      matchedCount: cards.length,
      changedCount: cards.length,
      dryRun,
      operation: 'delete_cards',
      sample: createBatchSample(cards),
    };
  }

  const changedPairs = cards
    .map((card) => {
      const nextCard = applyBatchOperationToCard(card, operation);
      return createCardSnapshot(nextCard) === createCardSnapshot(card)
        ? null
        : {
            previous: cloneEditableCard(card),
            next: nextCard,
          };
    })
    .filter((item): item is { previous: CardDataEntry; next: CardDataEntry } => item !== null);

  if (!dryRun && changedPairs.length > 0) {
    const ok = await context.modifyCardsWithSnapshotInTab(
      tab.id,
      changedPairs.map((item) => item.next),
      changedPairs.map((item) => item.previous),
    );
    if (!ok) {
      throw new Error('Failed to modify cards');
    }
  }

  return {
    db: { name: tab.name, path: tab.path },
    matchedCount: cards.length,
    changedCount: changedPairs.length,
    dryRun,
    operation: operation.type,
    sample: createBatchSample(changedPairs.map((item) => item.next)),
  };
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
    async get_current_selection(args) {
      const safeLimit = Math.max(1, Math.min(12, Math.round(Number(args.limit ?? 8))));
      const cards = context.getSelectedCardsInActiveTab();
      const currentActiveTab = context.listOpenDatabases().find((tab) => tab.id === context.getActiveDatabaseId()) ?? null;
      return {
        db: currentActiveTab
          ? {
              name: currentActiveTab.name,
              path: currentActiveTab.path,
            }
          : null,
        count: cards.length,
        sample: createBatchSample(cards, safeLimit),
      };
    },
    async read_card_script(args) {
      const fallbackCode = Number(currentCard.code ?? 0);
      const code = Number(args.code ?? fallbackCode);
      if (!Number.isInteger(code) || code <= 0) {
        throw new Error('A positive card id is required');
      }

      return context.readCardScript(code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    },
    async apply_batch_card_edit(args) {
      return applyBatchCardEdit(context, args as BatchEditArgs);
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
      '你是一个 Yu-Gi-Oh! 卡片数据编辑助手。你的任务是将用户提供的自由格式卡片手稿文本解析为结构化的卡片记录。',
      '',
      '## 可用工具',
      '你可以调用工具来查看当前卡片和已打开的数据库，以辅助解析。',
      '仅在需要时调用工具（例如查找系列代码、确认卡片类型），然后尽快返回最终 JSON。',
      '',
      '## 输出格式',
      '只返回一个 JSON 对象，不要包含 Markdown 代码块、解释或其他额外文字。',
      '',
      '### 顶层结构',
      '```',
      '{',
      '  "cards": [ ...一个或多个 CardDraft 对象... ],',
      '  "summary": "简要描述解析了什么内容"',
      '}',
      '```',
      '',
      '### CardDraft 结构',
      '```',
      '{',
      '  "code": number | null,          // 卡片密码/ID',
      '  "alias": number | null,         // 同名卡ID（异画等）',
      '  "name": string,                 // 卡名',
      '  "desc": string,                 // 效果文本/风味文本',
      '  "ot": number | string | null,   // 1=OCG, 2=TCG, 3=OCG/TCG, 4=Custom, 9=SC, 11=SC/TCG',
      '  "mainType": "monster" | "spell" | "trap" | null,',
      '  "subtypes": string[],           // 见下方允许的子类型名',
      '  "attribute": string | null,     // 见下方允许的属性名',
      '  "race": string | null,          // 见下方允许的种族名',
      '  "level": number | null,         // 怪兽等级/阶级 (1-13)',
      '  "leftScale": number | null,     // 灵摆左刻度 (0-13)',
      '  "rightScale": number | null,    // 灵摆右刻度 (0-13)',
      '  "attack": number | null,        // ATK 值 (-2 表示 "?")',
      '  "defense": number | null,       // DEF 值 (-2 表示 "?", Link怪兽为0)',
      '  "linkMarkers": string[],        // 见下方连接标记名',
      '  "setcodes": (string|number)[],  // 最多4个系列代码，十六进制字符串如 "0x00a1"',
      '  "category": number | null,      // 分类位掩码（很少使用）',
      '  "strings": string[]             // 最多16个计数器/提示字符串',
      '}',
      '```',
      '',
      '### 允许的字段值（必须使用以下英文关键字）',
      '',
      '**subtypes（怪兽）**: normal, effect, fusion, ritual, spirit, union, gemini,',
      '  tuner, synchro, token, flip, toon, xyz, pendulum, spssummon, link',
      '**subtypes（魔法）**: quickplay, continuous, equip, field, ritual_spell',
      '**subtypes（陷阱）**: continuous, counter',
      '**attribute**: earth, water, fire, wind, light, dark, divine',
      '**race**: warrior, spellcaster, fairy, fiend, zombie, machine, aqua, pyro,',
      '  rock, wingedbeast, plant, insect, thunder, dragon, beast, beastwarrior,',
      '  dinosaur, fish, seaserpent, reptile, psychic, divinebeast, creatorgod,',
      '  wyrm, cyberse, illusion',
      '**linkMarkers**: up, down, left, right, upleft, upright, downleft, downright',
      '',
      '## 解析规则',
      '1. 手稿包含多张卡时，按出现顺序返回。',
      '2. 手稿未提及的字段设为 null，**绝不猜测**。',
      '3. 语义字段（subtypes、attribute、race、linkMarkers）必须使用上面列出的英文关键字。',
      '4. Link 怪兽的 defense 必须为 0，并填写 linkMarkers；Link 怪兽的 level 表示 Link 值。',
      '5. desc 必须保留手稿中的原始换行符。',
      '6. setcodes 使用十六进制字符串（如 "0x00a1"）或整数。',
      '7. 灵摆怪兽需要同时设置 mainType 为 "monster"，subtypes 包含 "pendulum"，并填写 leftScale/rightScale。',
      '8. 融合/同调/超量/Link 怪兽的 subtypes 应包含对应的子类型（fusion/synchro/xyz/link），通常还包含 "effect"。',
      '9. 手稿中的 ATK/DEF 为 "?" 时，对应值设为 -2。',
      '10. 如果手稿语言不是英文，name 和 desc 保持原文，不要翻译。',
    ].join('\n'),
    userPrompt: [
      '将以下手稿解析为一个或多个可编辑的卡片记录。',
      '如果手稿不完整，只保留能确信推断出的字段，其余设为 null。',
      '',
      '当前卡片草稿（用于上下文参考/字段回退）：',
      JSON.stringify(serializeCardForAi(currentCard)),
      '',
      '--- 手稿内容 ---',
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

export async function runEditorInstruction(input: {
  instruction: string;
  currentCard: CardDataEntry;
  context: AiAppContext;
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
}) {
  const trimmedInstruction = input.instruction.trim();
  if (!trimmedInstruction) {
    throw new Error('Instruction is empty');
  }

  return runAgent({
    context: input.context,
    currentCard: input.currentCard,
    useTools: true,
    maxSteps: 6,
    toolNames: [
      'list_open_databases',
      'get_current_card',
      'get_current_selection',
      'get_card_by_id',
      'search_cards',
      'apply_batch_card_edit',
      'read_card_script',
    ],
    signal: input.signal,
    onStageChange: input.onStageChange,
    systemPrompt: [
      '你是 DataEditorY 的 AI 交互代理，负责在编辑器内执行自然语言指令。',
      '你的主要职责是操作当前已打开数据库中的卡片数据，尤其是批量修改、批量替换、批量删除与基于当前选择的处理。',
      '',
      '## 工作方式',
      '- 优先通过工具理解当前数据库、当前卡片、当前选择和搜索结果。',
      '- 当用户要求执行批量操作时，优先使用 `apply_batch_card_edit`，不要把大量卡片对象直接写回最终答案。',
      '- 对批量操作，先尽量明确目标范围：当前选择、当前页、全部卡片、搜索命中的卡片，或明确的卡号列表。',
      '- 当需要修改字段时，使用 `set_fields`，其中 patch 的字段结构与解析文稿的 CardDraft 保持一致。',
      '- 当需要把某段文字统一追加、前置或替换时，使用文本类操作。',
      '',
      '## `apply_batch_card_edit` 参数提示',
      '- `target.scope` 可用值：`current_selection`、`current_page`、`all_cards`、`search_query`、`card_ids`。',
      '- `target.queryFields` 默认搜索 name 和 desc；通常无需额外指定。',
      '- `operation.type` 可用值：`set_fields`、`append_text`、`prepend_text`、`replace_text`、`delete_cards`。',
      '- `set_fields.patch` 支持字段：name、desc、ot、mainType、subtypes、attribute、race、level、leftScale、rightScale、attack、defense、linkMarkers、setcodes、category、strings 等。',
      '',
      '## 输出要求',
      '- 如果已经执行工具，请用简洁中文总结“做了什么、命中了多少张、实际改了多少张”。',
      '- 如果用户只是提问而不是执行操作，也可以直接回答。',
      '- 不要输出冗长推理，不要输出大段 JSON，除非用户明确要求查看。',
      '',
      '## 安全与准确性',
      '- 不清楚目标范围时，先调用工具确认再执行。',
      '- 不要臆造数据库内容、卡片信息或脚本内容。',
      '- 除非用户明确要求删除，否则优先使用修改而不是删除。',
    ].join('\n'),
    userPrompt: [
      '请在当前编辑器上下文中执行或回答下面这条指令。',
      '',
      trimmedInstruction,
    ].join('\n'),
  });
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
        '## 参考脚本（来自已打开的数据库）',
        '以下脚本仅供参考风格和实现模式。不要逐字照抄——必须根据当前卡片的效果文本进行适配。',
        '注意：参考卡片的效果可能与当前卡片不同，只借鉴结构和 API 用法。',
        ...referenceScripts.map((ref, i) => [
          `### 参考 ${i + 1}: ${ref.name} (id: ${ref.code})`,
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
      '你是一个 Yu-Gi-Oh! 卡片本地化翻译助手。',
      '你的任务是将卡片文本字段翻译为指定语言，用于卡图渲染。',
      '',
      '## 输出格式',
      '只返回一个 JSON 对象，不要包含 Markdown 代码块或任何解释。',
      '结构: {"name":string, "monsterType":string, "description":string, "pendulumDescription":string}',
      '',
      '## 翻译规则',
      '1. 严格保留源文本中的换行符（\\n），不要增删换行。',
      '2. 保留卡片游戏特有的格式和标点符号：',
      '   - 效果分隔符如 ●、①、②、③ 等',
      '   - 卡名引用符号 「」 或引号',
      '   - 项目符号和编号列表',
      '   - 条件分隔符如 ：、；',
      '3. 空字符串不翻译，直接返回 ""。',
      '4. 使用目标语言的官方 Yu-Gi-Oh! 术语。',
      '5. monsterType 是卡片上的类型行，例如 "效果怪兽"、"Effect Monster"、"効果モンスター"。',
      '6. 翻译时保持效果文本的专业性和准确性，不要意译或简化游戏术语。',
      '',
      '## 各语言专项规则',
      '',
      '### 日本語（Japanese）',
      '翻译为日语时，必须为所有汉字添加振假名（furigana）。',
      '使用逐字 ruby 格式: `[漢(かん)][字(じ)]`',
      '',
      '规则：',
      '- 每个汉字字符必须有独立的 `[字(读)]` 标注。',
      '- 不要将多个汉字合并为一个标注。',
      '- 平假名、片假名、数字和符号不需要标注。',
      '',
      '示例：',
      '- 魔法使い → [魔(ま)][法(ほう)][使(つか)]い',
      '- 闇属性 → [闇(やみ)][属(ぞく)][性(せい)]',
      '- 効果モンスター → [効(こう)][果(か)]モンスター',
      '- 破壊する → [破(は)][壊(かい)]する',
      '- 特殊召喚 → [特(とく)][殊(しゅ)][召(しょう)][喚(かん)]',
      '- 墓地へ送る → [墓(ぼ)][地(ち)]へ[送(おく)]る',
      '- 「ブラック・マジシャン」 → 「ブラック・マジシャン」（片假名不标注）',
      '- このカードの①②の効果は1ターンに1度 → このカードの①②の[効(こう)][果(か)]は1ターンに1[度(ど)]',
      '',
      '此规则适用于所有文本字段: name、monsterType、description、pendulumDescription。',
      '',
      '### English',
      '- 使用 TCG 官方英文术语（如 "Special Summon"、"Graveyard"、"banish"）。',
      '- 卡名保持大写规范（如 "Dark Magician"）。',
      '- monsterType 使用标准格式（如 "Effect Monster"、"Continuous Spell"）。',
      '',
      '### 简体中文',
      '- 使用简中卡片的官方术语（如 "特殊召唤"、"墓地"、"除外"）。',
      '- 如果源文本已经是简体中文，保持原文不变。',
      '',
      '### 繁體中文',
      '- 使用繁中卡片的官方術語。',
      '- 注意简繁差异（如 "效果" vs "效果"、"怪兽" vs "怪獸"）。',
      '',
      '### 한국어（Korean）',
      '- 使用韩文官方术语。',
    ].join('\n'),
    userPrompt: [
      `将以下卡图文本字段翻译为「${input.targetLanguage}」。`,
      '使用目标语言自然的 Yu-Gi-Oh! 术语，保持卡片文本的专业风格。',
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
    '你的任务是根据当前卡片的结构化数据（尤其是 desc 字段中的效果文本）和参考脚本，生成一份完整、可运行、贴近官方写法的 Lua 脚本。',
    '',
    '## 输出要求',
    '- 只输出纯 Lua 代码，不要输出 Markdown 包裹（如 ```lua）、解释、标题或额外说明。',
    '- 如果效果文本存在歧义，优先保证脚本可运行，并仅在必要位置加入简短的 `-- TODO:` 注释。',
    '- 不要输出空行过多的代码，保持紧凑但可读。',
    '',
    '## 基本结构（必须遵守）',
    '```',
    '-- 卡名',
    'local s,id=GetID()',
    'function s.initial_effect(c)',
    '  -- 在此创建并注册所有效果',
    'end',
    '-- 辅助函数统一用 s.xxx 命名',
    '```',
    '- 所有效果必须在 `s.initial_effect(c)` 中创建并通过 `c:RegisterEffect(e)` 注册。',
    '- 辅助函数（filter、condition、cost、target、operation）统一使用 `s.` 前缀。',
    '- 不要写无意义的空函数、假代码或占位逻辑。',
    '',
    '## 工具使用策略',
    '- 参考脚本通常已预取并附在用户消息中，应优先使用这些上下文。',
    '- 仅当预取参考不足以判断具体实现时，才调用工具查询。',
    '- 查询策略：先搜索相似效果卡（search_cards），再读取其脚本（read_card_script）。',
    '- 最多调用 1-2 轮工具，然后必须返回最终代码。',
    '',
    '## 效果类型与注册方式',
    '',
    '### 怪兽效果',
    '- **起动效果**: `EFFECT_TYPE_IGNITION`，必须设置 `SetRange`（如 `LOCATION_MZONE`）。',
    '- **诱发效果（任意）**: `EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O`，自身相关事件。',
    '- **诱发效果（强制）**: `EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F`。',
    '- **场上诱发效果**: `EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O/F`，需设置 `SetRange` 和影响区域。',
    '- **速攻效果**: `EFFECT_TYPE_QUICK_O`（任意）/ `EFFECT_TYPE_QUICK_F`（强制），需 `SetHintTiming`。',
    '- **永续效果**: 使用 `EFFECT_TYPE_SINGLE` 或 `EFFECT_TYPE_FIELD`，配合 `SetValue` 而非 `SetOperation`。',
    '',
    '### 魔法/陷阱效果',
    '- **发动效果**: `EFFECT_TYPE_ACTIVATE`，配合 `SetCode(EVENT_FREE_CHAIN)` 或对应触发事件。',
    '- **永续魔法/陷阱**: 通常需要"发动效果"+"持续效果"两部分。',
    '- **装备魔法**: 需要 `EFFECT_TYPE_EQUIP` 和 `aux.EquipLimit` 相关处理。',
    '- **反击陷阱**: 围绕 `EVENT_CHAINING`，判断 `re`（被连锁的效果）和连锁状态。',
    '',
    '## 常见事件代码',
    '- 召唤成功: `EVENT_SUMMON_SUCCESS` / `EVENT_SPSUMMON_SUCCESS` / `EVENT_FLIP_SUMMON_SUCCESS`',
    '- 离场/移动: `EVENT_TO_GRAVE` / `EVENT_REMOVE` / `EVENT_DESTROY` / `EVENT_LEAVE_FIELD`',
    '- 特殊移动: `EVENT_TO_HAND` / `EVENT_BE_MATERIAL` / `EVENT_BATTLE_DESTROYING`',
    '- 阶段效果: `EVENT_PHASE+PHASE_STANDBY` / `EVENT_PHASE+PHASE_END`',
    '- 自由时点: `EVENT_FREE_CHAIN`',
    '- 连锁触发: `EVENT_CHAINING`',
    '',
    '## 函数签名约定（严格遵守）',
    '',
    '### condition 函数',
    '`function s.xxxcon(e,tp,eg,ep,ev,re,r,rp)`',
    '- 只做条件判断，返回 true/false。',
    '',
    '### cost 函数',
    '`function s.xxxcost(e,tp,eg,ep,ev,re,r,rp,chk)`',
    '- `chk==0` 分支：只检查是否能支付代价，返回 true/false。**绝不能**选择卡、移动卡或修改游戏状态。',
    '- `chk~=0` 分支：实际执行代价支付。',
    '',
    '### target 函数（不取对象）',
    '`function s.xxxtg(e,tp,eg,ep,ev,re,r,rp,chk)`',
    '- `chk==0` 分支：只检查可行性。',
    '- `chk~=0` 分支：设置 `Duel.SetOperationInfo`。',
    '',
    '### target 函数（取对象）',
    '`function s.xxxtg(e,tp,eg,ep,ev,re,r,rp,chk,chkc)`',
    '- 必须先处理 `chkc`：`if chkc then return chkc:IsLocation(...) and chkc:IsControler(...) and s.xxxfilter(chkc) end`',
    '- `chk==0` 分支：用 `Duel.IsExistingTarget` 检查。',
    '- `chk~=0` 分支：用 `Duel.SelectTarget` 选择，然后 `Duel.SetOperationInfo`。',
    '',
    '### operation 函数',
    '`function s.xxxop(e,tp,eg,ep,ev,re,r,rp)`',
    '- 如果依赖已取对象：必须用 `Duel.GetFirstTarget()` 获取，并检查 `tc:IsRelateToEffect(e)`。',
    '- 如果不取对象：用 `Duel.SelectMatchingCard` 或 `Duel.GetMatchingGroup` 选择。',
    '',
    '## 取对象 vs 不取对象（关键区别）',
    '- **取对象效果**: 效果需要 `EFFECT_FLAG_CARD_TARGET`，target 函数签名含 `chkc`，使用 `Duel.SelectTarget`。',
    '- **不取对象效果**: 不设置 `EFFECT_FLAG_CARD_TARGET`，target 函数签名不含 `chkc`，在 operation 中用 `Duel.SelectMatchingCard`。',
    '- 绝不能混用：不取对象效果不要写 `chkc` 参数或调用 `SelectTarget`。',
    '',
    '## 次数限制（精确区分）',
    '- "每回合1次"（此卡自身）: `e:SetCountLimit(1)`',
    '- "此卡名的①效果每回合只能使用1次": `e:SetCountLimit(1,id)`',
    '- "此卡名的②效果每回合只能使用1次": `e:SetCountLimit(1,id+1)`',
    '- "此卡名的效果每回合只能使用1次"（多个效果共享）: 所有效果都用 `e:SetCountLimit(1,id)`',
    '- 誓约类（发动过不能再发动其他）: `e:SetCountLimit(1,id+EFFECT_COUNT_CODE_OATH)`',
    '',
    '## SetProperty 常用标志',
    '- `EFFECT_FLAG_CARD_TARGET`: 取对象效果必须设置。',
    '- `EFFECT_FLAG_DELAY`: 从非公开区域（手卡/卡组/墓地）诱发时通常需要。',
    '- `EFFECT_FLAG_DAMAGE_STEP`: 伤害步骤可发动时设置。',
    '- `EFFECT_FLAG_DAMAGE_CAL`: 伤害计算时可发动。',
    '',
    '## 常用 API 模式',
    '',
    '### 选择与检查',
    '- 取对象检查: `Duel.IsExistingTarget(filter,tp,loc1,loc2,count,except,...)`',
    '- 取对象选择: `Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_xxx)` + `Duel.SelectTarget(tp,filter,tp,loc1,loc2,min,max,except,...)`',
    '- 不取对象检查: `Duel.IsExistingMatchingCard(filter,tp,loc1,loc2,count,except,...)`',
    '- 不取对象选择: `Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_xxx)` + `Duel.SelectMatchingCard(tp,filter,tp,loc1,loc2,min,max,except,...)`',
    '',
    '### 常见操作',
    '- 破坏: `Duel.Destroy(target,REASON_EFFECT)`',
    '- 送墓: `Duel.SendtoGrave(target,REASON_EFFECT)`',
    '- 除外: `Duel.Remove(target,POS_FACEUP,REASON_EFFECT)`',
    '- 回手: `Duel.SendtoHand(target,nil,REASON_EFFECT)` + `Duel.ConfirmCards(1-tp,target)`',
    '- 回卡组: `Duel.SendtoDeck(target,nil,SEQ_DECKSHUFFLE,REASON_EFFECT)`',
    '- 特殊召唤: `Duel.SpecialSummon(target,0,tp,tp,false,false,POS_FACEUP)`',
    '- 从卡组检索到手卡后: 必须 `Duel.ConfirmCards(1-tp,target)` 给对方确认。',
    '',
    '### 效果描述',
    '- 使用 `aux.Stringid(id,n)` 作为 `SetDescription` 的参数，`n` 从 0 开始，对应卡片的 strings 字段。',
    '',
    '## 类型专项规则',
    '- **通常怪兽**: 无效果时，最小可运行脚本即可（只需 `GetID` 和空的 `initial_effect`）。',
    '- **效果怪兽**: 完整拆分 condition/cost/target/operation，不要把复杂逻辑塞进一个函数。',
    '- **永续魔法/陷阱**: 通常需要"发动效果 + 持续效果"两部分。',
    '- **装备魔法**: 需要 `aux.EquipLimit` 和装备限制处理。',
    '- **反击陷阱**: 围绕 `EVENT_CHAINING`，判断被连锁效果的类型。',
    '- **灵摆卡**: 同时考虑怪兽效果（`LOCATION_MZONE`）和灵摆区域效果（`LOCATION_PZONE`）。',
    '- **Link 怪兽**: 没有 DEF，不要编造 DEF 相关逻辑。',
    '',
    '## 严禁事项',
    '1. 不要在 `chk==0` 里做任何副作用（选卡、移动、支付代价、修改状态）。',
    '2. 不要混用 COST 和 EFFECT 的 reason。',
    '3. 不要遗漏 `SetRange`，特别是手卡/墓地发动的效果。',
    '4. 不要把取对象效果写成不取对象，反之亦然。',
    '5. 不要遗漏 `SetCategory`、`SetCode`、`SetProperty`、`SetHintTiming` 中影响行为的设置。',
    '6. 不要调用不存在的 API 或臆造辅助函数名。',
    '7. 不要在 operation 中使用已取对象而不检查 `IsRelateToEffect`。',
    '8. 不要遗漏 `Duel.Hint(HINT_SELECTMSG,...)` 在选择卡片之前。',
    '',
    '## 生成策略',
    '1. 仔细阅读 desc 字段中的效果文本，拆分出每个独立效果及其类型（起动/诱发/速攻/永续）。',
    '2. 判断每个效果：发动位置、是否取对象、是否有次数限制、是否有代价。',
    '3. 优先参考已提供的参考脚本的风格和实现模式，但根据当前卡片效果进行适配。',
    '4. 仅在参考不足时调用工具补查。',
    '5. 输出前自行检查：函数签名、API 参数数量、取对象一致性、次数限制写法、SetRange 是否正确。',
    '',
    '## 最终目标',
    '生成的代码必须：可运行、结构清晰、贴近 YGOPro 社区习惯写法、忠实于效果文本。',
  ].join('\n');
}

function buildScriptRepairSystemPrompt() {
  return [
    '你是一个专业的 YGOPro / EDOPro Lua 脚本修复专家。',
    '你会收到一份已生成的脚本，以及本地静态检查器给出的诊断结果。',
    '你的任务是在尽量保留原有正确逻辑的前提下，修复脚本中的问题。',
    '',
    '## 输出要求',
    '- 只输出修复后的完整 Lua 代码，不要输出解释、Markdown 包裹或部分代码片段。',
    '- 必须输出完整脚本，不能省略未修改的部分。',
    '',
    '## 修复优先级',
    '1. **error 级别**: 必须修复。这些通常是不存在的 API、错误的参数数量、语法错误等。',
    '2. **warning 级别**: 尽量修复。这些通常是缺少 SetRange、遗漏 SetCategory 等。',
    '',
    '## 修复原则',
    '- **最小改动**: 只修改诊断指出的问题，不要重写整体风格。',
    '- **保持语义**: 不要删除真实需要的效果，不要改变效果的行为逻辑。',
    '- **不引入新错误**: 修复时不要引入新的不存在 API 或参数错误。',
    '- **保持结构**: 保持 `s.initial_effect(c)` 结构、辅助函数命名（`s.xxx`）、函数签名不变。',
    '',
    '## 常见修复模式',
    '- **不存在的 API**: 替换为正确的 API 名称（注意大小写和拼写）。',
    '- **参数数量错误**: 根据 API 签名调整参数数量。',
    '- **缺少 SetRange**: 为效果添加正确的 `e:SetRange(LOCATION_xxx)`。',
    '- **函数签名不匹配**: 确保 condition/cost/target/operation 的参数符合约定。',
    '- **取对象不一致**: 如果效果设置了 `EFFECT_FLAG_CARD_TARGET`，target 函数必须有 `chkc` 参数，反之亦然。',
    '',
    '## 如果脚本结构性错误严重',
    '可以重写局部或整体，但必须：',
    '- 忠于当前卡片数据中的效果文本（desc 字段）。',
    '- 保持 `local s,id=GetID()` 和 `s.initial_effect(c)` 的基本结构。',
    '- 确保所有效果都被正确实现。',
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

