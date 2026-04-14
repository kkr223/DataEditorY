import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { CardDataEntry, SearchFilters } from '$lib/types';
import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { createCardSnapshot } from '$lib/domain/card/draft';
import { ATTRIBUTE_MAP, LINK_MARKER_NAME_TO_BIT, RACE_MAP, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';

export const CARD_LIST_PAGE_SIZE = 50;
const MAX_DRAFT_UNDO_HISTORY = 100;

export type DraftUndoEntry = {
  snapshot: string;
  card: CardDataEntry;
};

export type CardScriptGenerationState = {
  isGenerating: boolean;
  stage: ScriptGenerationStage | '';
  abortController: AbortController | null;
};

export function buildEmptyDraftState(defaultCoverSrc: string) {
  return {
    lastSyncedSelectedId: null as number | null,
    lastLoadedCardSnapshot: '',
    originalCardCode: null as number | null,
    draftCard: createEmptyCard(),
    imageSrc: defaultCoverSrc,
  };
}

export function buildLoadedDraftState(card: CardDataEntry) {
  return {
    lastSyncedSelectedId: card.code,
    lastLoadedCardSnapshot: createCardSnapshot(card),
    originalCardCode: card.code,
    draftCard: cloneEditableCard(card),
  };
}

export function createCardScriptGenerationState(): CardScriptGenerationState {
  return {
    isGenerating: false,
    stage: '',
    abortController: null,
  };
}

export function createDraftUndoHistory(card: CardDataEntry): DraftUndoEntry[] {
  return [{
    snapshot: createCardSnapshot(card),
    card: cloneEditableCard(card),
  }];
}

export function pushDraftUndoHistory(history: DraftUndoEntry[], card: CardDataEntry): DraftUndoEntry[] {
  const snapshot = createCardSnapshot(card);
  if (history[history.length - 1]?.snapshot === snapshot) {
    return history;
  }

  const nextHistory = [
    ...history,
    {
      snapshot,
      card: cloneEditableCard(card),
    },
  ];

  return nextHistory.length > MAX_DRAFT_UNDO_HISTORY
    ? nextHistory.slice(nextHistory.length - MAX_DRAFT_UNDO_HISTORY)
    : nextHistory;
}

export function stepBackDraftUndoHistory(history: DraftUndoEntry[]) {
  if (history.length <= 1) {
    return {
      history,
      card: null as CardDataEntry | null,
    };
  }

  const nextHistory = history.slice(0, -1);
  return {
    history: nextHistory,
    card: cloneEditableCard(nextHistory[nextHistory.length - 1].card),
  };
}

export function createCardScriptGenerationController(state: CardScriptGenerationState) {
  return {
    setIsGenerating(value: boolean) {
      state.isGenerating = value;
    },
    setStage(value: ScriptGenerationStage | '') {
      state.stage = value;
    },
    setAbortController(value: AbortController | null) {
      state.abortController = value;
    },
    cancel() {
      state.abortController?.abort();
    },
    reset() {
      state.isGenerating = false;
      state.stage = '';
      state.abortController = null;
    },
  };
}

export function createCardImageInteractionController(input: {
  clickDelayMs?: number;
  onPickImage: () => void | Promise<void>;
  hasImageSrc: () => boolean;
  hasCardImageCapability: () => boolean;
  setPreviewOpen: (value: boolean) => void;
  setDrawerOpen: (value: boolean) => void;
}) {
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  function clearPendingClick() {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
  }

  return {
    clearPendingClick,
    dispose() {
      clearPendingClick();
    },
    hasPendingClick() {
      return clickTimer !== null;
    },
    handleImageClick() {
      clearPendingClick();
      clickTimer = setTimeout(() => {
        clickTimer = null;
        void input.onPickImage();
      }, input.clickDelayMs ?? 220);
    },
    handleImageDoubleClick(event: Pick<MouseEvent, 'preventDefault'>) {
      event.preventDefault();
      clearPendingClick();
      if (!input.hasImageSrc()) {
        return false;
      }
      input.setPreviewOpen(true);
      return true;
    },
    closePreview() {
      input.setPreviewOpen(false);
    },
    openDrawer() {
      if (!input.hasCardImageCapability()) {
        return false;
      }
      input.setDrawerOpen(true);
      return true;
    },
    closeDrawer() {
      input.setDrawerOpen(false);
    },
  };
}

export function isDraftDirty(input: {
  draftCard: CardDataEntry;
  originalCardCode: number | null;
  lastLoadedCardSnapshot: string;
}) {
  const currentSnapshot = createCardSnapshot(input.draftCard);
  if (input.originalCardCode === null) {
    return currentSnapshot !== createCardSnapshot(createEmptyCard());
  }

  return currentSnapshot !== input.lastLoadedCardSnapshot;
}

export function createInitialParseManuscript(draftCard: CardDataEntry) {
  if (!draftCard.name && !draftCard.desc) {
    return '';
  }

  return `${draftCard.name ?? ''}\n${draftCard.desc ?? ''}`.trim();
}

// ---------------------------------------------------------------------------
// buildSearchFiltersFromDraft — Convert a draft CardDataEntry into SearchFilters
// ---------------------------------------------------------------------------

function statToFilterValue(value: number): string {
  if (value === -2) return '-2';
  if (value === -1) return '-1';
  if (value > 0) return String(value);
  return '';
}

function findKeyByValue(map: Record<string, number>, value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return Object.entries(map).find(([, v]) => v === value)?.[0] ?? '';
}

function getNormalizedLevelValue(level: number): number {
  return Number.isFinite(level) ? (level & 0xff) : 0;
}

function scaleToSearchRuleValue(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value === -1) return 0;
  if (value > 0) return value;
  return null;
}

// Subtypes that unambiguously imply a main type when no explicit type bit is set.
// continuous_spell (0x20000) and ritual (0x80) are excluded because they are
// shared between spell/trap or monster/spell contexts.
const MONSTER_ONLY_BITS = [
  SUBTYPE_MAP.normal, SUBTYPE_MAP.effect, SUBTYPE_MAP.fusion,
  SUBTYPE_MAP.spirit, SUBTYPE_MAP.union, SUBTYPE_MAP.gemini,
  SUBTYPE_MAP.tuner, SUBTYPE_MAP.synchro, SUBTYPE_MAP.token,
  SUBTYPE_MAP.flip, SUBTYPE_MAP.toon, SUBTYPE_MAP.xyz,
  SUBTYPE_MAP.pendulum, SUBTYPE_MAP.spssummon, SUBTYPE_MAP.link,
];
const SPELL_ONLY_BITS = [SUBTYPE_MAP.quickplay, SUBTYPE_MAP.equip, SUBTYPE_MAP.field];
const TRAP_ONLY_BITS = [SUBTYPE_MAP.counter];

// Non-ambiguous subtype keys and their bits
const SUBTYPE_ENTRIES: [string, number][] = [
  ['normal', SUBTYPE_MAP.normal], ['effect', SUBTYPE_MAP.effect],
  ['fusion', SUBTYPE_MAP.fusion], ['spirit', SUBTYPE_MAP.spirit],
  ['union', SUBTYPE_MAP.union], ['gemini', SUBTYPE_MAP.gemini],
  ['tuner', SUBTYPE_MAP.tuner], ['synchro', SUBTYPE_MAP.synchro],
  ['token', SUBTYPE_MAP.token], ['quickplay', SUBTYPE_MAP.quickplay],
  ['equip', SUBTYPE_MAP.equip], ['field', SUBTYPE_MAP.field],
  ['counter', SUBTYPE_MAP.counter], ['flip', SUBTYPE_MAP.flip],
  ['toon', SUBTYPE_MAP.toon], ['xyz', SUBTYPE_MAP.xyz],
  ['pendulum', SUBTYPE_MAP.pendulum], ['spssummon', SUBTYPE_MAP.spssummon],
  ['link', SUBTYPE_MAP.link],
];

export function buildSearchFiltersFromDraft(draftCard: CardDataEntry): SearchFilters {
  const filters: SearchFilters = { ...DEFAULT_SEARCH_FILTERS };
  const rules: string[] = [];
  const type = draftCard.type;
  const normalizedLevel = getNormalizedLevelValue(draftCard.level);
  const leftScaleRuleValue = scaleToSearchRuleValue(draftCard.lscale);
  const rightScaleRuleValue = scaleToSearchRuleValue(draftCard.rscale);

  const hasMonsterBit = (type & TYPE_MAP.monster) !== 0;
  const hasSpellBit = (type & TYPE_MAP.spell) !== 0;
  const hasTrapBit = (type & TYPE_MAP.trap) !== 0;
  const hasPendulumSignal = (type & SUBTYPE_MAP.pendulum) !== 0 || leftScaleRuleValue !== null || rightScaleRuleValue !== null;
  const hasLinkSignal = (type & SUBTYPE_MAP.link) !== 0 || draftCard.linkMarker > 0;

  // --- Determine main type ---
  const hasMask = (bits: number[]) => bits.some((b) => (type & b) !== 0);
  const hasMonsterSignals =
    draftCard.attack !== 0 || draftCard.defense !== 0 || normalizedLevel > 0 ||
    draftCard.attribute > 0 || draftCard.race > 0 || draftCard.linkMarker > 0 ||
    draftCard.lscale > 0 || draftCard.rscale > 0;

  let mainType = '';
  if (hasMonsterBit || hasMask(MONSTER_ONLY_BITS) || hasPendulumSignal || hasLinkSignal) mainType = 'monster';
  else if (hasSpellBit || hasMask(SPELL_ONLY_BITS)) mainType = 'spell';
  else if (hasTrapBit || hasMask(TRAP_ONLY_BITS)) mainType = 'trap';
  else if (!hasSpellBit && !hasTrapBit && hasMonsterSignals) mainType = 'monster';

  filters.type = mainType;

  // --- Collect matched subtypes and build type rules ---
  const typeRuleKeys: string[] = [];
  const matchedSubtypes: string[] = [];
  if (mainType) typeRuleKeys.push(mainType);

  for (const [key, bit] of SUBTYPE_ENTRIES) {
    if ((type & bit) !== 0) {
      matchedSubtypes.push(key);
      if (!typeRuleKeys.includes(key)) typeRuleKeys.push(key);
    }
  }

  if (hasPendulumSignal && !matchedSubtypes.includes('pendulum')) {
    matchedSubtypes.push('pendulum');
    if (!typeRuleKeys.includes('pendulum')) typeRuleKeys.push('pendulum');
  }
  if (hasLinkSignal && !matchedSubtypes.includes('link')) {
    matchedSubtypes.push('link');
    if (!typeRuleKeys.includes('link')) typeRuleKeys.push('link');
  }

  // Handle shared subtypes: ritual (0x80) and continuous (0x20000)
  if ((type & SUBTYPE_MAP.ritual) !== 0) {
    const key = hasSpellBit ? 'ritual_spell' : 'ritual';
    if (!matchedSubtypes.includes(key)) matchedSubtypes.push(key);
    if (!typeRuleKeys.includes(key)) typeRuleKeys.push(key);
  }
  if ((type & SUBTYPE_MAP.continuous_spell) !== 0) {
    const key = hasSpellBit ? 'continuous_spell' : hasTrapBit ? 'continuous_trap' : 'continuous_spell';
    if (!matchedSubtypes.includes(key)) matchedSubtypes.push(key);
    if (!typeRuleKeys.includes(key)) typeRuleKeys.push(key);
  }

  // Single subtype goes to the dropdown (only when main type provides context);
  // otherwise everything goes to rules only
  if (matchedSubtypes.length === 1 && mainType) filters.subtype = matchedSubtypes[0];

  for (const key of typeRuleKeys) rules.push(`type contains ${key}`);

  // --- Text fields ---
  if (draftCard.code > 0) filters.id = String(draftCard.code);
  if (draftCard.name.trim()) filters.name = draftCard.name.trim();
  if (draftCard.desc.trim()) filters.desc = draftCard.desc.trim();

  // --- ATK / DEF ---
  const isMonster = mainType === 'monster';
  const isLink = hasLinkSignal;

  if (isMonster) {
    const atk = statToFilterValue(draftCard.attack);
    if (atk) { filters.atkMin = atk; filters.atkMax = atk; }
    if (!isLink) {
      const def = statToFilterValue(draftCard.defense);
      if (def) { filters.defMin = def; filters.defMax = def; }
    }
  }

  // --- Numeric rule fields ---
  if (draftCard.ot > 0) rules.push(`ot = ${draftCard.ot}`);
  if (isMonster && normalizedLevel > 0) rules.push(`level = ${normalizedLevel}`);
  if (leftScaleRuleValue !== null) rules.push(`scale = ${leftScaleRuleValue}`);
  if (rightScaleRuleValue !== null) rules.push(`rscale = ${rightScaleRuleValue}`);
  if (isLink && draftCard.linkMarker > 0) {
    for (const [key, bit] of Object.entries(LINK_MARKER_NAME_TO_BIT)) {
      if ((draftCard.linkMarker & bit) !== 0) rules.push(`linkmarker contains ${key}`);
    }
  }

  // --- Attribute / Race ---
  const attr = findKeyByValue(ATTRIBUTE_MAP, draftCard.attribute);
  if (attr) filters.attribute = attr;
  const race = findKeyByValue(RACE_MAP, draftCard.race);
  if (race) filters.race = race;

  // --- Setcodes ---
  const setcodes = Array.isArray(draftCard.setcode) ? draftCard.setcode : [];
  for (let i = 0; i < 4; i++) {
    const raw = Number(setcodes[i] ?? 0);
    if (!Number.isInteger(raw) || raw <= 0) continue;
    const hex = raw.toString(16);
    if (i === 0) filters.setcode1 = hex;
    else if (i === 1) filters.setcode2 = hex;
    else if (i === 2) filters.setcode3 = hex;
    else filters.setcode4 = hex;
  }

  filters.rule = rules.join(' and ');
  return filters;
}

// ---------------------------------------------------------------------------
// Keyboard navigation & misc helpers
// ---------------------------------------------------------------------------

export function shouldIgnoreArrowNavigation(input: {
  event: KeyboardEvent;
  isKeyboardNavigating: boolean;
  isParseModalOpen: boolean;
  isCardImageDrawerOpen: boolean;
  isImagePreviewOpen: boolean;
  isEditableTarget: (target: EventTarget | null) => boolean;
}) {
  return (
    input.event.defaultPrevented
    || input.event.repeat
    || input.event.isComposing
    || input.event.ctrlKey
    || input.event.metaKey
    || input.event.altKey
    || input.event.shiftKey
    || input.isEditableTarget(input.event.target)
    || input.isKeyboardNavigating
    || input.isParseModalOpen
    || input.isCardImageDrawerOpen
    || input.isImagePreviewOpen
  );
}

export function resolveSelectionNavigationTarget(input: {
  cards: CardDataEntry[];
  selectedId: number | null;
  delta: number;
}) {
  if (input.cards.length === 0) {
    return null;
  }

  const currentIndex = input.cards.findIndex((card) => card.code === input.selectedId);
  const fallbackIndex = input.delta > 0 ? 0 : input.cards.length - 1;
  const baseIndex = currentIndex === -1 ? fallbackIndex : currentIndex;
  const nextIndex = Math.max(0, Math.min(input.cards.length - 1, baseIndex + input.delta));
  if (nextIndex === currentIndex) {
    return null;
  }

  return input.cards[nextIndex]?.code ?? null;
}

export function resolvePageNavigationTarget(input: {
  totalCards: number;
  currentPage: number;
  delta: number;
  pageSize?: number;
}) {
  if (input.totalCards <= 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(input.totalCards / (input.pageSize ?? CARD_LIST_PAGE_SIZE)));
  const nextPage = Math.max(1, Math.min(totalPages, input.currentPage + input.delta));
  if (nextPage === input.currentPage) {
    return null;
  }

  return nextPage;
}

export async function handleCardEditorKeydown(
  event: KeyboardEvent,
  input: {
    isDbLoaded: boolean;
    isKeyboardNavigating: boolean;
    isParseModalOpen: boolean;
    isCardImageDrawerOpen: boolean;
    isImagePreviewOpen: boolean;
    isEditableTarget: (target: EventTarget | null) => boolean;
    confirmDiscardDraft: () => Promise<boolean>;
    onModify: () => Promise<void>;
    getSelectionTarget: (delta: number) => number | null;
    selectCard: (cardCode: number) => void;
    getPageTarget: (delta: number) => number | null;
    setCurrentPage: (page: number) => void;
    runSearch: () => Promise<void>;
    setKeyboardNavigating: (value: boolean) => void;
  },
) {
  if (event.defaultPrevented || event.repeat || event.isComposing || !input.isDbLoaded) {
    return;
  }

  const isPrimary = event.ctrlKey || event.metaKey;
  if (
    isPrimary
    && !event.altKey
    && !event.shiftKey
    && event.key === 'Enter'
    && !input.isKeyboardNavigating
    && !input.isParseModalOpen
    && !input.isCardImageDrawerOpen
    && !input.isImagePreviewOpen
  ) {
    event.preventDefault();
    input.setKeyboardNavigating(true);
    try {
      await input.onModify();
    } finally {
      input.setKeyboardNavigating(false);
    }
    return;
  }

  if (shouldIgnoreArrowNavigation({
    event,
    isKeyboardNavigating: input.isKeyboardNavigating,
    isParseModalOpen: input.isParseModalOpen,
    isCardImageDrawerOpen: input.isCardImageDrawerOpen,
    isImagePreviewOpen: input.isImagePreviewOpen,
    isEditableTarget: input.isEditableTarget,
  })) {
    return;
  }

  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
    return;
  }

  event.preventDefault();
  input.setKeyboardNavigating(true);

  try {
    if (event.key === 'ArrowUp') {
      const nextCardCode = input.getSelectionTarget(-1);
      if (nextCardCode === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.selectCard(nextCardCode);
      return;
    }

    if (event.key === 'ArrowDown') {
      const nextCardCode = input.getSelectionTarget(1);
      if (nextCardCode === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.selectCard(nextCardCode);
      return;
    }

    if (event.key === 'ArrowLeft') {
      const nextPage = input.getPageTarget(-1);
      if (nextPage === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.setCurrentPage(nextPage);
      await input.runSearch();
      return;
    }

    if (event.key === 'ArrowRight') {
      const nextPage = input.getPageTarget(1);
      if (nextPage === null) {
        return;
      }
      if (!(await input.confirmDiscardDraft())) {
        return;
      }
      input.setCurrentPage(nextPage);
      await input.runSearch();
    }
  } finally {
    input.setKeyboardNavigating(false);
  }
}

export function handleParseModalBackdropDismiss(
  event: KeyboardEvent,
  close: () => void,
) {
  if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    close();
  }
}
