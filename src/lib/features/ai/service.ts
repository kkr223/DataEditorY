import type { CardDataEntry } from '$lib/types';
import type {
  CardCollectionQuery,
  CardSearchPage,
} from '$lib/modules/card';
import type {
  WorkspaceAiMessage,
  WorkspaceAiPatch,
  WorkspaceAiProposal,
  WorkspaceAiToolRun,
} from '$lib/modules/card/workbench/workspaceMetadataState.svelte';

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
    name: AiToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AgentStage =
  | 'collecting_references'
  | 'requesting_model'
  | 'running_tools'
  | 'finalizing_response';

export type AiConfig = {
  apiBaseUrl: string;
  model: string;
  temperature: number;
  secretKey: string;
};

export type OpenDbMeta = {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
};

export type AiAppContext = {
  getAiConfig: () => Promise<AiConfig>;
  listOpenDatabases: () => OpenDbMeta[];
  getActiveDatabaseId: () => string | null;
  queryCards: <T = unknown>(documentId: string, query: CardCollectionQuery) => Promise<T>;
  getSelectedCardsInActiveTab: () => CardDataEntry[];
  readCardScript: (code: number, dbPath?: string) => Promise<{
    exists: boolean;
    path: string | null;
    content: string | null;
  }>;
  readImageConfig: (code: number, dbPath?: string) => unknown;
  resolveScriptPath: (dbPath: string, fileName: string) => Promise<string>;
  resolveScriptTestPath: (dbPath: string, code: number) => Promise<string>;
};

export type AgentToolCallEvent = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AgentToolResultEvent = AgentToolCallEvent & {
  ok: boolean;
  result: unknown;
};

export type AiSkill = {
  name: string;
  description: string;
  tools: AiToolName[];
  body: string;
};

export type AiTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AiAgentResult = {
  text: string;
  model: string;
  toolRuns: WorkspaceAiToolRun[];
  proposal: WorkspaceAiProposal | null;
  usedSkills: string[];
  tokenUsage: AiTokenUsage;
};

export type AiToolName =
  | 'list_open_databases'
  | 'get_database_summary'
  | 'search_cards'
  | 'get_card'
  | 'get_selected_cards'
  | 'read_card_script'
  | 'get_script_test_context'
  | 'readimg'
  | 'read_image_config'
  | 'propose_card_patch'
  | 'propose_batch_card_patch'
  | 'propose_script_write'
  | 'propose_script_test_plan'
  | 'propose_image_config_patch';

const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_AGENT_STEPS = 30;
const MAX_TOOL_SUMMARY = 900;
const SKILL_MANIFEST_URL = '/resources/ai-skills/manifest.json';

export const AI_TOOL_NAMES: AiToolName[] = [
  'list_open_databases',
  'get_database_summary',
  'search_cards',
  'get_card',
  'get_selected_cards',
  'read_card_script',
  'get_script_test_context',
  'readimg',
  'read_image_config',
  'propose_card_patch',
  'propose_batch_card_patch',
  'propose_script_write',
  'propose_script_test_plan',
  'propose_image_config_patch',
];

export const READONLY_PROPOSAL_TOOL_NAMES: AiToolName[] = [
  'list_open_databases',
  'get_database_summary',
  'search_cards',
  'get_card',
  'get_selected_cards',
  'read_card_script',
  'get_script_test_context',
  'readimg',
  'read_image_config',
];

const TOOL_DEFINITIONS: Record<AiToolName, AiToolDefinition> = {
  list_open_databases: {
    type: 'function',
    function: {
      name: 'list_open_databases',
      description: 'List all currently opened CDB workspaces with their id, name, and file path. Call this first to discover available databases before any read or write operation.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  get_database_summary: {
    type: 'function',
    function: {
      name: 'get_database_summary',
      description: 'Get a lightweight summary of an opened CDB database: total card count and a small sample of cards. Use dbPath to target a specific database, or omit to use the active one.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          documentId: { type: 'string', description: 'Document ID of the target CDB (alternative to dbPath).' },
        },
        additionalProperties: false,
      },
    },
  },
  search_cards: {
    type: 'function',
    function: {
      name: 'search_cards',
      description: 'Search cards in opened CDB databases by name or description text. Use an empty string query with page/limit to enumerate all cards in chunks (default limit=10, max=50). Returns card code, name, type, attack, defense, level, and a truncated desc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search text matched against card name and desc. Use empty string to list all cards.' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to search all open databases.' },
          page: { type: 'number', description: 'Page number (1-based). Default 1.' },
          limit: { type: 'number', description: 'Cards per page (1-50). Default 10.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  get_card: {
    type: 'function',
    function: {
      name: 'get_card',
      description: 'Read the full data of one card by its numeric code (card ID) from an opened database. Returns all fields: code, name, type, attack, defense, level, race, attribute, desc, setcode, strings.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer, unique card ID).' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  get_selected_cards: {
    type: 'function',
    function: {
      name: 'get_selected_cards',
      description: 'Read the cards currently selected by the user in the Card Explorer of the active CDB workspace. Use when the user refers to "selected cards" or "current selection".',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of cards to return (1-50). Default 20.' },
        },
        additionalProperties: false,
      },
    },
  },
  read_card_script: {
    type: 'function',
    function: {
      name: 'read_card_script',
      description: 'Read the Lua script file for a card from the configured script directory. Returns exists (bool), path, and content. Always call this before generating or modifying a script to avoid overwriting existing work.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer). The file name will be c{code}.lua.' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  get_script_test_context: {
    type: 'function',
    function: {
      name: 'get_script_test_context',
      description: 'Return paths needed for an in-app temporary script test plan: target CDB path, script directory, .dey test plan path, and built-in helper script names.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer).' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  read_image_config: {
    type: 'function',
    function: {
      name: 'read_image_config',
      description: 'Read the per-card image rendering configuration stored in workspace metadata (.dey). Returns card image form fields such as name, desc, type text, attribute, level display. Returns null if no config exists yet.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer).' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  readimg: {
    type: 'function',
    function: {
      name: 'readimg',
      description: 'Alias for read_image_config. Read the per-card image rendering configuration stored in workspace metadata (.dey). Prefer this name in image_text_translate skill contexts.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer).' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
        },
        required: ['code'],
        additionalProperties: false,
      },
    },
  },
  propose_card_patch: {
    type: 'function',
    function: {
      name: 'propose_card_patch',
      description: 'Queue a sandbox patch for one card\'s CDB fields. The patch object must contain only the fields you want to change — do not include unchanged fields. This creates an auditable proposal; the user must confirm before it is applied. This is NOT a terminal action: if more cards need updating, continue calling tools.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code of the card to patch.' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          patch: { type: 'object', description: 'Object with only the fields to change (e.g. {"name": "新名称", "desc": "新效果文字"}).' },
        },
        required: ['code', 'patch'],
        additionalProperties: false,
      },
    },
  },
  propose_batch_card_patch: {
    type: 'function',
    function: {
      name: 'propose_batch_card_patch',
      description: 'Queue a sandbox batch patch for multiple cards in one proposal. Each item in cards specifies a code and a patch object with only the fields to change. Include a summary object to describe the intent. This is NOT a terminal action: continue until all target cards are covered.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          cards: {
            type: 'array',
            description: 'Array of {code, patch} objects. patch must contain only the fields to change.',
            items: {
              type: 'object',
              properties: {
                code: { type: 'number', description: 'Card code.' },
                patch: { type: 'object', description: 'Fields to change for this card.' },
              },
              required: ['code', 'patch'],
              additionalProperties: false,
            },
          },
          summary: { type: 'object', description: 'A brief summary of what this batch changes (e.g. {"field": "attack", "change": "set all to 1500"}).' },
        },
        required: ['cards'],
        additionalProperties: false,
      },
    },
  },
  propose_script_write: {
    type: 'function',
    function: {
      name: 'propose_script_write',
      description: 'Queue a sandbox proposal to overwrite one Lua script file (c{code}.lua). fileName must be a .lua file name (e.g. "c12345678.lua"). The content must be the complete script. Read the existing script first with read_card_script. This is NOT a terminal action.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          fileName: { type: 'string', description: 'Lua file name, e.g. "c12345678.lua". Must end with .lua.' },
          content: { type: 'string', description: 'Complete Lua script content to write.' },
        },
        required: ['fileName', 'content'],
        additionalProperties: false,
      },
    },
  },
  propose_script_test_plan: {
    type: 'function',
    function: {
      name: 'propose_script_test_plan',
      description: 'Queue a temporary in-app script test plan for one card script. The JSON plan is written under workspace .dey/ai-tests only after user confirmation. It must describe setup/assertions, not TypeScript code.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          code: { type: 'number', description: 'Card code (positive integer).' },
          plan: {
            type: 'object',
            description: 'JSON test plan for the built-in runner, e.g. {"version":1,"cardCode":123,"checks":[{"kind":"load-script"}]}.',
          },
        },
        required: ['code', 'plan'],
        additionalProperties: false,
      },
    },
  },
  propose_image_config_patch: {
    type: 'function',
    function: {
      name: 'propose_image_config_patch',
      description: 'Queue a sandbox patch for a card\'s image rendering configuration in workspace metadata (.dey). The patch object should contain only the image form fields to change (e.g. name, desc, pendDesc, attribute text). Read the current config with readimg first. This is NOT a terminal action.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'number', description: 'Card code (positive integer).' },
          dbPath: { type: 'string', description: 'File path of the target CDB. Omit to use the active database.' },
          patch: { type: 'object', description: 'Image config fields to change. Only include fields that need updating.' },
        },
        required: ['code', 'patch'],
        additionalProperties: false,
      },
    },
  },
};

function createId(prefix: string) {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${id}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseToolArguments(value: string) {
  try {
    const parsed = JSON.parse(value || '{}');
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function summarizeToolResult(result: unknown) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  if (!text) return '';
  return text.length > MAX_TOOL_SUMMARY ? `${text.slice(0, MAX_TOOL_SUMMARY)}...` : text;
}

function extractKeyIds(result: unknown): Array<string | number> {
  if (!isRecord(result)) return [];
  const values = [
    result.id,
    result.code,
    result.cardCode,
    ...(Array.isArray(result.cardIds) ? result.cardIds : []),
  ];
  return values.filter((item): item is string | number => (
    typeof item === 'string' || typeof item === 'number'
  ));
}

function getChatCompletionsEndpoint(apiBaseUrl: string) {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL;
  if (normalized.endsWith('/chat/completions')) return normalized;
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
    throw new Error(payload?.error?.message || payload?.message || `AI request failed (${response.status})`);
  }
  return payload;
}

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };

  const meta: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  let currentKey = '';
  for (const line of lines) {
    const keyValue = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyValue) {
      currentKey = keyValue[1];
      meta[currentKey] = keyValue[2];
      continue;
    }
    const listValue = line.match(/^\s*-\s*(.+)$/);
    if (listValue && currentKey) {
      meta[currentKey] = `${meta[currentKey] ? `${meta[currentKey]}\n` : ''}${listValue[1]}`;
    }
  }
  return { meta, body: match[2] };
}

function normalizeSkillTools(value: string | undefined) {
  const requested = (value ?? '')
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  return requested.filter((item): item is AiToolName => AI_TOOL_NAMES.includes(item as AiToolName));
}

export function parseSkillMarkdown(text: string): AiSkill {
  const { meta, body } = parseFrontmatter(text);
  const name = meta.name?.trim() || 'unnamed';
  return {
    name,
    description: meta.description?.trim() || name,
    tools: normalizeSkillTools(meta.tools),
    body: body.trim(),
  };
}

export function extractRequestedSkillNames(input: string) {
  return [...input.matchAll(/@([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
}

export async function loadAiSkills() {
  const manifest = await fetch(SKILL_MANIFEST_URL)
    .then((response) => response.ok ? response.json() : [])
    .catch(() => []);
  const files = Array.isArray(manifest) ? manifest.map(String) : [];
  const skills = await Promise.all(files.map(async (file) => {
    const text = await fetch(`/resources/ai-skills/${file}`).then((response) => response.text());
    return parseSkillMarkdown(text);
  }));
  return skills.filter((skill) => skill.name !== 'unnamed');
}

function chooseSkills(input: string, skills: AiSkill[]) {
  const requested = new Set(extractRequestedSkillNames(input));
  if (requested.size > 0) {
    return skills.filter((skill) => requested.has(skill.name));
  }

  const normalized = input.toLowerCase();
  return skills.filter((skill) => {
    const haystack = `${skill.name} ${skill.description}`.toLowerCase();
    return skill.name.split(/[_-]/).some((part) => normalized.includes(part))
      || haystack.split(/\s+/).some((word) => word.length > 4 && normalized.includes(word));
  }).slice(0, 2);
}

function getActiveDb(context: AiAppContext, dbPath?: string) {
  const tabs = context.listOpenDatabases();
  if (dbPath) {
    return tabs.find((tab) => tab.path === dbPath) ?? null;
  }
  return tabs.find((tab) => tab.id === context.getActiveDatabaseId()) ?? tabs[0] ?? null;
}

async function getCard(context: AiAppContext, code: number, dbPath?: string) {
  const tab = getActiveDb(context, dbPath);
  if (!tab) return null;
  const card = await context.queryCards<CardDataEntry | null>(tab.id, { kind: 'getById', cardId: code });
  return card ? { tab, card } : null;
}

function applyCardPatch(card: CardDataEntry, patch: Record<string, unknown>) {
  return {
    ...card,
    ...patch,
    setcode: Array.isArray(patch.setcode) ? patch.setcode.map(Number) : [...card.setcode],
    strings: Array.isArray(patch.strings) ? patch.strings.map(String) : [...card.strings],
  } as CardDataEntry;
}

const CARD_PATCH_ALIASES: Record<string, keyof CardDataEntry> = {
  atk: 'attack',
  def: 'defense',
};

const STRING_CARD_PATCH_FIELDS = new Set<keyof CardDataEntry>(['name', 'desc']);
const NUMBER_ARRAY_CARD_PATCH_FIELDS = new Set<keyof CardDataEntry>(['setcode']);
const STRING_ARRAY_CARD_PATCH_FIELDS = new Set<keyof CardDataEntry>(['strings']);
const NUMERIC_CARD_PATCH_FIELDS = new Set<keyof CardDataEntry>([
  'alias',
  'type',
  'attack',
  'defense',
  'level',
  'race',
  'attribute',
  'category',
  'ot',
  'lscale',
  'rscale',
  'linkMarker',
  'ruleCode',
]);

function normalizeFiniteNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeAiNumericCardField(key: keyof CardDataEntry, value: unknown) {
  if ((key === 'attack' || key === 'defense') && (value === '?' || value === '？')) {
    return -2;
  }
  return normalizeFiniteNumber(value);
}

export function normalizeAiCardPatch(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  const patch: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = (CARD_PATCH_ALIASES[rawKey] ?? rawKey) as keyof CardDataEntry;
    if (STRING_CARD_PATCH_FIELDS.has(key)) {
      patch[key] = String(rawValue ?? '');
      continue;
    }
    if (NUMBER_ARRAY_CARD_PATCH_FIELDS.has(key) && Array.isArray(rawValue)) {
      patch[key] = rawValue
        .map(normalizeFiniteNumber)
        .filter((item): item is number => item !== null);
      continue;
    }
    if (STRING_ARRAY_CARD_PATCH_FIELDS.has(key) && Array.isArray(rawValue)) {
      patch[key] = rawValue.map((item) => String(item ?? '')).slice(0, 16);
      continue;
    }
    if (NUMERIC_CARD_PATCH_FIELDS.has(key)) {
      const numeric = normalizeAiNumericCardField(key, rawValue);
      if (numeric !== null) patch[key] = numeric;
    }
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

async function runTool(input: {
  name: AiToolName;
  args: Record<string, unknown>;
  context: AiAppContext;
  patches: WorkspaceAiPatch[];
}) {
  const { name, args, context, patches } = input;
  if (name === 'list_open_databases') {
    return context.listOpenDatabases();
  }

  if (name === 'get_database_summary') {
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined)
      ?? context.listOpenDatabases().find((item) => item.id === args.documentId);
    if (!tab) return null;
    const page = await context.queryCards<CardSearchPage>(tab.id, {
      kind: 'search',
      expression: { kind: 'all' },
      page: 1,
      pageSize: 5,
    });
    return { db: tab, total: page.total, sample: page.cards };
  }

  if (name === 'search_cards') {
    const query = String(args.query ?? '').trim();
    const pageNumber = Math.max(1, Math.round(Number(args.page ?? 1)));
    const limit = Math.max(1, Math.min(50, Math.round(Number(args.limit ?? 10))));
    const tabs = typeof args.dbPath === 'string'
      ? context.listOpenDatabases().filter((tab) => tab.path === args.dbPath)
      : context.listOpenDatabases();
    const results = [];
    for (const tab of tabs) {
      const page = await context.queryCards<CardSearchPage>(tab.id, {
        kind: 'search',
        expression: query ? {
          kind: 'or',
          expressions: [
            { kind: 'textContains', field: 'name', value: query },
            { kind: 'textContains', field: 'desc', value: query },
          ],
        } : { kind: 'all' },
        page: pageNumber,
        pageSize: limit,
      });
      results.push({ db: tab, total: page.total, page: pageNumber, pageSize: limit, cards: page.cards.slice(0, limit) });
    }
    return results;
  }

  if (name === 'get_card') {
    const code = Number(args.code ?? 0);
    if (!Number.isInteger(code) || code <= 0) throw new Error('code must be a positive integer');
    const result = await getCard(context, code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    return result ? { db: result.tab, card: result.card } : null;
  }

  if (name === 'get_selected_cards') {
    const limit = Math.max(1, Math.min(50, Math.round(Number(args.limit ?? 20))));
    const cards = context.getSelectedCardsInActiveTab();
    return { count: cards.length, cards: cards.slice(0, limit) };
  }

  if (name === 'read_card_script') {
    const code = Number(args.code ?? 0);
    if (!Number.isInteger(code) || code <= 0) throw new Error('code must be a positive integer');
    return context.readCardScript(code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
  }

  if (name === 'get_script_test_context') {
    const code = Number(args.code ?? 0);
    if (!Number.isInteger(code) || code <= 0) throw new Error('code must be a positive integer');
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    if (!tab) throw new Error('opened database is required');
    const script = await context.readCardScript(code, tab.path);
    return {
      code,
      cdbPath: tab.path,
      scriptPath: script.path,
      scriptDir: script.path ? script.path.replace(/[\\/][^\\/]+$/, '') : null,
      testPlanPath: await context.resolveScriptTestPath(tab.path, code),
      builtinHelpers: ['constant.lua', 'utility.lua', 'procedure.lua'],
    };
  }

  if (name === 'read_image_config' || name === 'readimg') {
    const code = Number(args.code ?? 0);
    if (!Number.isInteger(code) || code <= 0) throw new Error('code must be a positive integer');
    return context.readImageConfig(code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
  }

  if (name === 'propose_card_patch') {
    const code = Number(args.code ?? 0);
    const normalizedPatch = normalizeAiCardPatch(args.patch);
    if (!Number.isInteger(code) || code <= 0 || !normalizedPatch) throw new Error('code and patch are required');
    const result = await getCard(context, code, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    if (!result) throw new Error('target card was not found in an opened database');
    const patch: WorkspaceAiPatch = {
      id: createId('ai-patch'),
      kind: 'card',
      documentId: result.tab.id,
      cdbPath: result.tab.path,
      cardCode: code,
      before: result.card,
      patch: normalizedPatch,
      after: applyCardPatch(result.card, normalizedPatch),
    };
    patches.push(patch);
    return { patchId: patch.id, kind: patch.kind, cardCode: code, queuedPatches: patches.length, continueIfMoreWorkRemains: true };
  }

  if (name === 'propose_batch_card_patch') {
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    if (!tab || !Array.isArray(args.cards)) throw new Error('opened database and cards are required');
    const cards = [];
    for (const item of args.cards) {
      if (!isRecord(item)) continue;
      const normalizedPatch = normalizeAiCardPatch(item.patch);
      if (!normalizedPatch) continue;
      const code = Number(item.code ?? 0);
      if (!Number.isInteger(code) || code <= 0) continue;
      const current = await context.queryCards<CardDataEntry | null>(tab.id, { kind: 'getById', cardId: code });
      if (!current) continue;
      cards.push({
        cardCode: code,
        before: current,
        patch: normalizedPatch,
        after: applyCardPatch(current, normalizedPatch),
      });
    }
    const patch: WorkspaceAiPatch = {
      id: createId('ai-patch'),
      kind: 'batch-card',
      documentId: tab.id,
      cdbPath: tab.path,
      summary: isRecord(args.summary) ? args.summary : {},
      cards,
    };
    patches.push(patch);
    return { patchId: patch.id, kind: patch.kind, cardIds: cards.map((card) => card.cardCode), queuedPatches: patches.length, continueIfMoreWorkRemains: true };
  }

  if (name === 'propose_script_write') {
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    const fileName = String(args.fileName ?? '').trim().replace(/\\/g, '/').split('/').pop() ?? '';
    const content = String(args.content ?? '');
    if (!tab || !fileName.endsWith('.lua') || !content.trim()) throw new Error('opened database, lua fileName, and content are required');
    const patch: WorkspaceAiPatch = {
      id: createId('ai-patch'),
      kind: 'script',
      documentId: tab.id,
      cdbPath: tab.path,
      path: await context.resolveScriptPath(tab.path, fileName),
      content,
    };
    patches.push(patch);
    return { patchId: patch.id, kind: patch.kind, path: patch.path, queuedPatches: patches.length, continueIfMoreWorkRemains: true };
  }

  if (name === 'propose_script_test_plan') {
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    const code = Number(args.code ?? 0);
    if (!tab || !Number.isInteger(code) || code <= 0 || !isRecord(args.plan)) throw new Error('opened database, code, and plan are required');
    const patch: WorkspaceAiPatch = {
      id: createId('ai-patch'),
      kind: 'script-test-plan',
      documentId: tab.id,
      cdbPath: tab.path,
      cardCode: code,
      path: await context.resolveScriptTestPath(tab.path, code),
      plan: args.plan,
    };
    patches.push(patch);
    return { patchId: patch.id, kind: patch.kind, path: patch.path, queuedPatches: patches.length, continueIfMoreWorkRemains: true };
  }

  if (name === 'propose_image_config_patch') {
    const code = Number(args.code ?? 0);
    const tab = getActiveDb(context, typeof args.dbPath === 'string' ? args.dbPath : undefined);
    if (!tab || !Number.isInteger(code) || code <= 0 || !isRecord(args.patch)) throw new Error('opened database, code, and patch are required');
    const patch: WorkspaceAiPatch = {
      id: createId('ai-patch'),
      kind: 'image',
      documentId: tab.id,
      cdbPath: tab.path,
      cardCode: code,
      patch: args.patch,
    };
    patches.push(patch);
    return { patchId: patch.id, kind: patch.kind, cardCode: code, queuedPatches: patches.length, continueIfMoreWorkRemains: true };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function buildSystemPrompt(skills: AiSkill[]) {
  return [
    '你是 DataEditorY 的数据库级 AI agent，专门处理官方 YGOPro 自定义卡片数据库（.cdb）的读取与编辑任务。',
    '',
    '## 工作模式',
    '- 你可以读取当前已打开的 CDB、卡片数据、Lua 脚本、卡图配置，并通过 sandbox proposal 工具将修改写入可审查的提案（存储于 .dey）。',
    '- 禁止直接写入真实 CDB、脚本文件或卡图 metadata。所有真实写入只能由用户在 Review/Apply UI 中确认后执行。',
    '- 如果用户要求修改，必须调用 propose_* 工具生成 sandbox proposal；普通问答、数据查询可以直接回答。',
    '- propose_* 工具每次只排队一个或一批提案项，不代表任务完成。长任务要持续读取、分页、生成提案，直到覆盖所有目标或达到步骤上限。',
    '- 处理全库或大量卡片时：使用 search_cards 空 query + page/limit 分批枚举；一次回复中可以并行调用多个 propose_* 工具以提高效率。',
    '- 如果上下文不足以安全生成 patch，只描述风险并说明需要用户补充哪些信息，不要伪造工具结果。',
    '',
    '## CDB 卡片数据模型',
    '以下是 CardDataEntry 的主要字段，修改时必须遵守字段语义：',
    '- code: 卡片唯一 ID（正整数），不可修改。',
    '- name: 卡片名称字符串。',
    '- type: 卡片类型位掩码（多个类型用位 OR 组合，如 Monster=1, Spell=2, Trap=4, Effect=32 等）。',
    '- attack: 攻击力（整数，?/-2 用 -2 表示；兼容输入 atk，但提案中优先使用 attack）。',
    '- defense: 守备力（整数，?/-2，Link 怪兽无守备则为 0；兼容输入 def，但提案中优先使用 defense）。',
    '- level: 星级/阶级（1-12；Link 怪兽此字段存 Link 数 1-8）。',
    '- race: 种族位掩码（如 Warrior=1, Spellcaster=2, Dragon=4 等）。',
    '- attribute: 属性位掩码（EARTH=1, WATER=2, FIRE=4, WIND=8, LIGHT=16, DARK=32, DIVINE=64）。',
    '- desc: 效果文字，字符串。多段效果之间用换行分隔，保留原文换行结构。',
    '- setcode: 系列代码数组（数字，最多 4 个）。不确定时留空，不要猜测。',
    '- strings: 卡片计数器/标记名称数组（字符串，最多 16 个）。',
    '',
    '## 行为规则',
    '1. 读取数据后，把关键字段（name、type、attack/defense/level、desc 前 120 字符）呈现给用户，让用户确认理解一致后再提案。',
    '2. 批量修改前先 search_cards 确认目标范围，避免无关卡片被误改。',
    '3. propose_card_patch 和 propose_batch_card_patch 的 patch 对象只包含需要变更的字段，其余字段不要出现在 patch 中。',
    '4. 生成 Lua 脚本时：必须先用 read_card_script 读取现有脚本（如果存在），参考相似卡片的脚本结构；脚本必须以 -- 注释说明卡片代码和名称。',
    '5. 生成脚本时也应生成最小脚本测试计划提案；测试计划是 JSON，放在 .dey/ai-tests，由应用内 runner 执行，不生成 TypeScript 测试文件。',
    '6. 对不确定的字段值（setcode、type 掩码计算等），在消息中说明不确定性，让用户确认后再写入 patch。',
    '',
    '可用 skills:',
    skills.length
      ? skills.map((skill) => `- @${skill.name}: ${skill.description}`).join('\n')
      : '- 无显式 skill，按通用数据库助手模式工作。',
    '',
    ...skills.map((skill) => [
      `## Skill: ${skill.name}`,
      `Allowed tools: ${skill.tools.join(', ') || 'all'}`,
      skill.body,
    ].join('\n')),
  ].join('\n');
}

function createProposal(input: {
  threadId: string;
  title: string;
  summary: string;
  patches: WorkspaceAiPatch[];
  toolRuns: WorkspaceAiToolRun[];
  model: string;
}): WorkspaceAiProposal | null {
  if (input.patches.length === 0) return null;
  return {
    id: createId('ai-proposal'),
    threadId: input.threadId,
    title: input.title.slice(0, 96) || 'AI Proposal',
    summary: input.summary,
    patches: input.patches,
    toolRuns: input.toolRuns,
    model: input.model,
    createdAt: Date.now(),
    status: 'pending',
  };
}

function createHistoryMessages(history: WorkspaceAiMessage[] | undefined): AiMessage[] {
  const messages: AiMessage[] = [];
  for (const message of history ?? []) {
    const content = message.content.trim();
    if (!content) continue;
    if (message.role === 'system') {
      messages.push({ role: 'system', content });
    } else if (message.role === 'user') {
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'assistant', content });
    }
  }
  return messages;
}

export async function runWorkspaceAgent(input: {
  threadId: string;
  instruction: string;
  history?: WorkspaceAiMessage[];
  context: AiAppContext;
  signal?: AbortSignal;
  onStageChange?: (stage: AgentStage) => void;
  onToolCall?: (event: AgentToolCallEvent) => void;
  onToolResult?: (event: AgentToolResultEvent) => void;
}) {
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error('Instruction is empty');

  input.onStageChange?.('collecting_references');
  const allSkills = await loadAiSkills();
  const usedSkills = chooseSkills(instruction, allSkills);
  const allowedToolNames = new Set<AiToolName>(
    usedSkills.flatMap((skill) => skill.tools.length ? skill.tools : AI_TOOL_NAMES),
  );
  if (allowedToolNames.size === 0) {
    AI_TOOL_NAMES.forEach((tool) => allowedToolNames.add(tool));
  }

  const config = await input.context.getAiConfig();
  const toolRuns: WorkspaceAiToolRun[] = [];
  const patches: WorkspaceAiPatch[] = [];
  const tools = [...allowedToolNames].map((name) => TOOL_DEFINITIONS[name]);
  const messages: AiMessage[] = [
    { role: 'system', content: buildSystemPrompt(usedSkills) },
    ...createHistoryMessages(input.history),
    { role: 'user', content: instruction },
  ];

  let finalText = '';
  const tokenUsage: AiTokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  for (let step = 0; step < MAX_AGENT_STEPS; step += 1) {
    input.onStageChange?.('requesting_model');
    const payload = await requestChatCompletion(config, {
      model: config.model,
      temperature: config.temperature,
      messages,
      tools,
      tool_choice: 'auto',
    }, input.signal);

    // Accumulate token usage from each API call
    const usage = payload?.usage;
    if (usage && typeof usage === 'object') {
      tokenUsage.promptTokens += Number(usage.prompt_tokens ?? 0);
      tokenUsage.completionTokens += Number(usage.completion_tokens ?? 0);
      tokenUsage.totalTokens += Number(usage.total_tokens ?? tokenUsage.promptTokens + tokenUsage.completionTokens);
    }
    const message = payload?.choices?.[0]?.message;
    const content = typeof message?.content === 'string' ? message.content : '';
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    messages.push({
      role: 'assistant',
      content,
      tool_calls: toolCalls,
    });

    if (toolCalls.length === 0) {
      finalText = content || (patches.length ? '已生成沙盒提案。' : '');
      break;
    }

    input.onStageChange?.('running_tools');
    for (const toolCall of toolCalls) {
      const name = toolCall?.function?.name as AiToolName;
      const args = parseToolArguments(String(toolCall?.function?.arguments ?? '{}'));
      if (!allowedToolNames.has(name)) {
        throw new Error(`Tool ${name} is not allowed by the selected skill`);
      }

      input.onToolCall?.({ id: toolCall.id, name, arguments: args });
      const createdAt = Date.now();
      try {
        const result = await runTool({ name, args, context: input.context, patches });
        const run: WorkspaceAiToolRun = {
          id: toolCall.id,
          name,
          status: 'completed',
          input: args,
          outputSummary: summarizeToolResult(result),
          keyIds: extractKeyIds(result),
          createdAt,
        };
        toolRuns.push(run);
        input.onToolResult?.({ id: toolCall.id, name, arguments: args, ok: true, result });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        const result = { error: error instanceof Error ? error.message : String(error) };
        const run: WorkspaceAiToolRun = {
          id: toolCall.id,
          name,
          status: 'failed',
          input: args,
          outputSummary: summarizeToolResult(result),
          createdAt,
        };
        toolRuns.push(run);
        input.onToolResult?.({ id: toolCall.id, name, arguments: args, ok: false, result });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  input.onStageChange?.('finalizing_response');
  if (!finalText) {
    finalText = patches.length ? '已生成沙盒提案，请在右侧 Review 中确认。' : '模型没有返回可用结果。';
  }

  return {
    text: finalText,
    model: config.model,
    toolRuns,
    proposal: createProposal({
      threadId: input.threadId,
      title: instruction.replace(/@[A-Za-z0-9_-]+/g, '').trim() || instruction,
      summary: finalText,
      patches,
      toolRuns,
      model: config.model,
    }),
    usedSkills: usedSkills.map((skill) => skill.name),
    tokenUsage,
  } satisfies AiAgentResult;
}
