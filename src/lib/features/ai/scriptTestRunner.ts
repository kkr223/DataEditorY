import { tauriBridge } from '$lib/infrastructure/tauri';
import { pathExists, readCdbFile, readTextFile } from '$lib/infrastructure/tauri/commands';
import {
  normalizeScriptTestPlan,
  type ScriptTestCheck,
  type ScriptTestLocation,
  type ScriptTestPlan,
  type ScriptTestPosition,
} from './scriptTestPlan';

type ScriptOverrides = Record<string, string>;

export type ScriptTestRunInput = {
  plan: unknown;
  cdbPath: string;
  cardCode: number;
  ygoproPath?: string;
  scriptDirectory?: string;
  scriptOverrides?: ScriptOverrides;
};

export type ScriptTestRunResult = {
  ok: boolean;
  summary: string;
  loadedScripts: string[];
  logs: string[];
  steps: number;
};

const COMMON_SCRIPT_NAMES = [
  'constant.lua',
  'utility.lua',
  'procedure.lua',
  'archetype_setcode_constants.lua',
  'special.lua',
  'init.lua',
];

const LOCATIONS: Record<ScriptTestLocation, number> = {
  deck: 0x01,
  hand: 0x02,
  mzone: 0x04,
  szone: 0x08,
  grave: 0x10,
  removed: 0x20,
  banished: 0x20,
  extra: 0x40,
};

const POSITIONS: Record<ScriptTestPosition, number> = {
  faceup_attack: 0x01,
  facedown_attack: 0x02,
  faceup_defense: 0x04,
  facedown_defense: 0x08,
};

function fileName(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() ?? path;
}

function normalizeMapName(name: string) {
  return fileName(name).trim();
}

function resolveLocation(value: ScriptTestLocation | number) {
  if (typeof value === 'number') return value;
  return LOCATIONS[value] ?? LOCATIONS.hand;
}

function resolvePosition(value: ScriptTestPosition | number) {
  if (typeof value === 'number') return value;
  return POSITIONS[value] ?? POSITIONS.faceup_attack;
}

async function safeExists(path: string) {
  try {
    return await pathExists(path);
  } catch {
    return false;
  }
}

async function readCdbs(cdbPath: string, ygoproPath: string | undefined) {
  const paths = [cdbPath];
  if (ygoproPath?.trim()) {
    const cardsCdb = await tauriBridge.join(ygoproPath.trim(), 'cards.cdb');
    if (await safeExists(cardsCdb)) paths.push(cardsCdb);
  }

  const cdbs: Uint8Array[] = [];
  for (const path of [...new Set(paths)]) {
    cdbs.push(new Uint8Array(await readCdbFile(path)));
  }
  return cdbs;
}

async function scriptDirs(input: ScriptTestRunInput) {
  const dirs: string[] = [];
  if (input.ygoproPath?.trim()) {
    dirs.push(await tauriBridge.join(input.ygoproPath.trim(), 'script'));
  }
  dirs.push(await tauriBridge.join(await tauriBridge.dirname(input.cdbPath), 'script'));
  if (input.scriptDirectory?.trim()) dirs.push(input.scriptDirectory.trim());
  return [...new Set(dirs.map((item) => item.replace(/[\\/]+$/, '')))];
}

function scriptNamesForPlan(plan: ScriptTestPlan) {
  return [...new Set([...COMMON_SCRIPT_NAMES, ...plan.includeScripts])];
}

async function readScriptMap(input: ScriptTestRunInput, plan: ScriptTestPlan) {
  const map = new Map<string, string>();
  const dirs = await scriptDirs(input);
  for (const name of scriptNamesForPlan(plan)) {
    const normalized = normalizeMapName(name);
    if (!normalized) continue;
    for (const dir of dirs) {
      const path = await tauriBridge.join(dir, normalized);
      if (await safeExists(path)) {
        map.set(normalized, await readTextFile(path));
        map.set(normalized.toLowerCase(), map.get(normalized) ?? '');
      }
    }
  }

  for (const [name, content] of Object.entries(input.scriptOverrides ?? {})) {
    const normalized = normalizeMapName(name);
    if (!normalized || !content.trim()) continue;
    map.set(normalized, content);
    map.set(normalized.toLowerCase(), content);
  }
  return map;
}

function assertNoErrors(errors: string[]) {
  if (errors.length) throw new Error(errors.map((item) => `Script Error: ${item}`).join('\n'));
}

function assertScriptLoaded(scriptMap: Map<string, string>, code: number) {
  const name = `c${code}.lua`;
  if (!scriptMap.has(name) && !scriptMap.has(name.toLowerCase())) {
    throw new Error(`Script ${name} was not found in the project or configured YGOPro script directories`);
  }
}

function assertFieldCount(actual: number, check: Extract<ScriptTestCheck, { kind: 'assert-field-count' }>) {
  if (check.equals != null && actual !== check.equals) {
    throw new Error(`Expected ${check.location} count ${check.equals}, got ${actual}`);
  }
  if (check.min != null && actual < check.min) {
    throw new Error(`Expected ${check.location} count >= ${check.min}, got ${actual}`);
  }
  if (check.max != null && actual > check.max) {
    throw new Error(`Expected ${check.location} count <= ${check.max}, got ${actual}`);
  }
}

export async function runScriptTestPlan(input: ScriptTestRunInput): Promise<ScriptTestRunResult> {
  const plan = normalizeScriptTestPlan(input.plan, input.cardCode);
  const [{ default: initSqlJs }, { default: sqlWasmUrl }, coreModule] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('koishipro-core.js'),
  ]);

  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  const cdbs = await readCdbs(input.cdbPath, input.ygoproPath);
  const scriptMap = await readScriptMap(input, plan);
  const cardReader = coreModule.SqljsCardReader(SQL, ...cdbs);
  const core = await coreModule.createOcgcoreWrapper();
  const errors: string[] = [];
  const logs: string[] = [];
  let steps = 0;
  let started = false;
  let duel: ReturnType<typeof core.createDuel> | null = null;

  try {
    core.setCardReader(cardReader, true);
    core.setScriptReader(coreModule.MapScriptReader(scriptMap), true);
    core.setMessageHandler((_duel, message, type) => {
      if (type === coreModule.OcgcoreMessageType.ScriptError) errors.push(message);
      else logs.push(message);
    }, true);

    duel = Array.isArray(plan.seed)
      ? core.createDuelV2(plan.seed)
      : core.createDuel(typeof plan.seed === 'number' ? plan.seed : 0);
    duel.setPlayerInfo({ player: 0, lp: 8000, startHand: 0, drawCount: 0 });
    duel.setPlayerInfo({ player: 1, lp: 8000, startHand: 0, drawCount: 0 });

    for (const card of plan.setup) {
      duel.newCard({
        code: card.code,
        owner: card.owner,
        player: card.controller,
        location: resolveLocation(card.location),
        sequence: card.sequence ?? 0,
        position: resolvePosition(card.position),
      });
      assertNoErrors(errors);
    }

    const startDuel = () => {
      if (started || !duel) return;
      started = true;
      duel.startDuel(typeof plan.start === 'number' ? plan.start : (plan.start ?? 0));
      assertNoErrors(errors);
    };

    for (const check of plan.checks) {
      if (check.kind === 'load-script') {
        const code = check.code ?? plan.cardCode;
        assertScriptLoaded(scriptMap, code);
        duel.preloadScript(`./script/c${code}.lua`);
      } else if (check.kind === 'start-duel') {
        startDuel();
      } else if (check.kind === 'advance') {
        startDuel();
        for (const _result of duel.advance(coreModule.SlientAdvancor())) {
          steps += 1;
          assertNoErrors(errors);
          if (steps >= check.maxSteps) break;
        }
      } else if (check.kind === 'assert-lp') {
        startDuel();
        const actual = duel.queryFieldInfo().field.players[check.player].lp;
        if (actual !== check.equals) throw new Error(`Expected player ${check.player} LP ${check.equals}, got ${actual}`);
      } else if (check.kind === 'assert-field-count') {
        startDuel();
        assertFieldCount(duel.queryFieldCount({
          player: check.player,
          location: resolveLocation(check.location),
        }), check);
      }
      assertNoErrors(errors);
    }

    return {
      ok: true,
      summary: `${plan.checks.length} checks passed, ${steps} duel steps`,
      loadedScripts: [...scriptMap.keys()].filter((item) => item === item.toLowerCase()),
      logs,
      steps,
    };
  } finally {
    try {
      duel?.endDuel();
    } catch {
      // already ended
    }
    cardReader.finalize?.();
    core.finalize();
  }
}
