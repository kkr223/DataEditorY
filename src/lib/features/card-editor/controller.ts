import { DEFAULT_SEARCH_FILTERS } from '$lib/types';
import type { CardDataEntry, SearchFilterState } from '$lib/types';
import type { ScriptGenerationStage } from '$lib/services/scriptGenerationStages';
import { cloneEditableCard, createEmptyCard } from '$lib/utils/card';
import { createCardSnapshot } from '$lib/domain/card/draft';
import { ATTRIBUTE_MAP, LINK_MARKER_NAME_TO_BIT, RACE_MAP, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';

export const CARD_LIST_PAGE_SIZE = 50;

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

function appendRuleFilter(parts: string[], clause: string) {
  const normalized = clause.trim();
  if (!normalized) return;
  parts.push(normalized);
}

function appendMaskContainsRule(parts: string[], field: string, values: string[]) {
  for (const value of values) {
    appendRuleFilter(parts, `${field} contains ${value}`);
  }
}

function toDexStatFilterValue(value: number) {
  if (value === -2) return '-2';
  if (value === -1) return '-1';
  if (value >= 0) return String(value);
  return '';
}

function findKeyByExactValue(source: Record<string, number>, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  return Object.entries(source).find(([, bit]) => bit === value)?.[0] ?? '';
}

function inferImplicitMainType(type: number) {
  const hasMonsterSubtype =
    (type & (
      SUBTYPE_MAP.normal
      | SUBTYPE_MAP.effect
      | SUBTYPE_MAP.fusion
      | SUBTYPE_MAP.spirit
      | SUBTYPE_MAP.union
      | SUBTYPE_MAP.gemini
      | SUBTYPE_MAP.tuner
      | SUBTYPE_MAP.synchro
      | SUBTYPE_MAP.token
      | SUBTYPE_MAP.flip
      | SUBTYPE_MAP.toon
      | SUBTYPE_MAP.xyz
      | SUBTYPE_MAP.pendulum
      | SUBTYPE_MAP.spssummon
      | SUBTYPE_MAP.link
    )) !== 0;

  if (hasMonsterSubtype) return 'monster';

  const hasSpellSubtype =
    (type & (
      SUBTYPE_MAP.quickplay
      | SUBTYPE_MAP.equip
      | SUBTYPE_MAP.field
    )) !== 0;

  if (hasSpellSubtype) return 'spell';

  const hasTrapSubtype =
    (type & (
      SUBTYPE_MAP.counter
    )) !== 0;

  if (hasTrapSubtype) return 'trap';

  return '';
}

function getSelectedSubtypeKeys(type: number, mainTypeOverride = '', includeImplicitNormal = true) {
  if ((type & TYPE_MAP.monster) !== 0 || mainTypeOverride === 'monster') {
    const monsterSubtypeOrder = [
      'link',
      'xyz',
      'synchro',
      'fusion',
      'ritual',
      'pendulum',
      'toon',
      'flip',
      'tuner',
      'gemini',
      'union',
      'spirit',
      'spssummon',
      'token',
      'normal',
      'effect',
    ] as const;

    const matches = monsterSubtypeOrder.filter((key) => (type & SUBTYPE_MAP[key]) !== 0);
    return matches.length > 0 ? matches : (includeImplicitNormal ? ['normal'] : []);
  }

  if ((type & TYPE_MAP.spell) !== 0 || mainTypeOverride === 'spell') {
    const spellSubtypeOrder = [
      'quickplay',
      'continuous_spell',
      'equip',
      'field',
      'ritual_spell',
    ] as const;

    const matches = spellSubtypeOrder.filter((key) => (type & SUBTYPE_MAP[key]) !== 0);
    return matches.length > 0 ? matches : (includeImplicitNormal ? ['normal'] : []);
  }

  if ((type & TYPE_MAP.trap) !== 0 || mainTypeOverride === 'trap') {
    const trapSubtypeOrder = [
      'continuous_trap',
      'counter',
    ] as const;

    const matches = trapSubtypeOrder.filter((key) => (type & SUBTYPE_MAP[key]) !== 0);
    return matches.length > 0 ? matches : (includeImplicitNormal ? ['normal'] : []);
  }

  return [];
}

function getDexTypeRuleKeys(type: number, mainType: string) {
  const keys: string[] = [];
  const hasExplicitMonsterType = (type & TYPE_MAP.monster) !== 0;
  const hasExplicitSpellType = (type & TYPE_MAP.spell) !== 0;
  const hasExplicitTrapType = (type & TYPE_MAP.trap) !== 0;

  if (mainType) {
    keys.push(mainType);
  }

  const pushIfMissing = (key: string) => {
    if (!keys.includes(key)) {
      keys.push(key);
    }
  };

  if ((type & SUBTYPE_MAP.normal) !== 0) pushIfMissing('normal');
  if ((type & SUBTYPE_MAP.effect) !== 0) pushIfMissing('effect');
  if ((type & SUBTYPE_MAP.fusion) !== 0) pushIfMissing('fusion');
  if ((type & SUBTYPE_MAP.spirit) !== 0) pushIfMissing('spirit');
  if ((type & SUBTYPE_MAP.union) !== 0) pushIfMissing('union');
  if ((type & SUBTYPE_MAP.gemini) !== 0) pushIfMissing('gemini');
  if ((type & SUBTYPE_MAP.tuner) !== 0) pushIfMissing('tuner');
  if ((type & SUBTYPE_MAP.synchro) !== 0) pushIfMissing('synchro');
  if ((type & SUBTYPE_MAP.token) !== 0) pushIfMissing('token');
  if ((type & SUBTYPE_MAP.quickplay) !== 0) pushIfMissing('quickplay');
  if ((type & SUBTYPE_MAP.equip) !== 0) pushIfMissing('equip');
  if ((type & SUBTYPE_MAP.field) !== 0) pushIfMissing('field');
  if ((type & SUBTYPE_MAP.counter) !== 0) pushIfMissing('counter');
  if ((type & SUBTYPE_MAP.flip) !== 0) pushIfMissing('flip');
  if ((type & SUBTYPE_MAP.toon) !== 0) pushIfMissing('toon');
  if ((type & SUBTYPE_MAP.xyz) !== 0) pushIfMissing('xyz');
  if ((type & SUBTYPE_MAP.pendulum) !== 0) pushIfMissing('pendulum');
  if ((type & SUBTYPE_MAP.spssummon) !== 0) pushIfMissing('spssummon');
  if ((type & SUBTYPE_MAP.link) !== 0) pushIfMissing('link');

  if ((type & SUBTYPE_MAP.ritual) !== 0) {
    pushIfMissing(hasExplicitSpellType ? 'ritual_spell' : 'ritual');
  }

  if ((type & SUBTYPE_MAP.continuous_spell) !== 0) {
    if (hasExplicitSpellType) pushIfMissing('continuous_spell');
    else if (hasExplicitTrapType) pushIfMissing('continuous_trap');
    else pushIfMissing('continuous_spell');
  }

  return keys;
}

export function buildSearchFiltersFromDraft(draftCard: CardDataEntry): SearchFilterState {
  const nextFilters: SearchFilterState = {
    ...DEFAULT_SEARCH_FILTERS,
  };
  const ruleParts: string[] = [];
  const hasExplicitMonsterType = (draftCard.type & TYPE_MAP.monster) !== 0;
  const hasExplicitSpellType = (draftCard.type & TYPE_MAP.spell) !== 0;
  const hasExplicitTrapType = (draftCard.type & TYPE_MAP.trap) !== 0;
  const implicitMainType = inferImplicitMainType(draftCard.type);
  const hasImplicitMonsterSearchSignal =
    draftCard.attack !== 0
    || draftCard.defense !== 0
    || draftCard.level > 0
    || draftCard.attribute > 0
    || draftCard.race > 0
    || draftCard.linkMarker > 0
    || draftCard.lscale > 0
    || draftCard.rscale > 0;

  const isMonster =
    hasExplicitMonsterType
    || implicitMainType === 'monster'
    || (!hasExplicitSpellType && !hasExplicitTrapType && hasImplicitMonsterSearchSignal);
  const isLink = (draftCard.type & SUBTYPE_MAP.link) !== 0;
  const isPendulum = (draftCard.type & SUBTYPE_MAP.pendulum) !== 0;

  if (draftCard.code > 0) {
    nextFilters.id = String(draftCard.code);
  }

  if (draftCard.name.trim()) {
    nextFilters.name = draftCard.name.trim();
  }

  if (draftCard.desc.trim()) {
    nextFilters.desc = draftCard.desc.trim();
  }

  if (isMonster) {
    nextFilters.type = 'monster';
  } else if (hasExplicitSpellType || implicitMainType === 'spell') {
    nextFilters.type = 'spell';
  } else if (hasExplicitTrapType || implicitMainType === 'trap') {
    nextFilters.type = 'trap';
  }

  const subtypeKeys = getSelectedSubtypeKeys(draftCard.type, nextFilters.type, false);
  if (subtypeKeys.length === 1) {
    nextFilters.subtype = subtypeKeys[0];
  } else if (subtypeKeys.length > 1) {
    appendMaskContainsRule(ruleParts, 'type', subtypeKeys);
  }

  const dexTypeRuleKeys = getDexTypeRuleKeys(draftCard.type, nextFilters.type);
  if (dexTypeRuleKeys.length > 0) {
    appendMaskContainsRule(ruleParts, 'type', dexTypeRuleKeys);
  }

  const atkFilterValue = toDexStatFilterValue(draftCard.attack);
  if (isMonster && atkFilterValue) {
    nextFilters.atkMin = atkFilterValue;
    nextFilters.atkMax = atkFilterValue;
  }

  const defFilterValue = toDexStatFilterValue(draftCard.defense);
  if (isMonster && !isLink && defFilterValue) {
    nextFilters.defMin = defFilterValue;
    nextFilters.defMax = defFilterValue;
  }

  if (draftCard.ot > 0) {
    appendRuleFilter(ruleParts, `ot = ${draftCard.ot}`);
  }

  if (isMonster && draftCard.level > 0) {
    appendRuleFilter(ruleParts, `level = ${draftCard.level}`);
  }

  if (isPendulum) {
    appendRuleFilter(ruleParts, `scale = ${draftCard.lscale}`);
    appendRuleFilter(ruleParts, `rscale = ${draftCard.rscale}`);
  }

  if (isLink && draftCard.linkMarker > 0) {
    const linkMarkerKeys = Object.entries(LINK_MARKER_NAME_TO_BIT)
      .filter(([, bit]) => (draftCard.linkMarker & bit) !== 0)
      .map(([key]) => key);
    appendMaskContainsRule(ruleParts, 'linkmarker', linkMarkerKeys);
  }

  const attribute = findKeyByExactValue(ATTRIBUTE_MAP, draftCard.attribute);
  if (attribute) {
    nextFilters.attribute = attribute;
  }

  const race = findKeyByExactValue(RACE_MAP, draftCard.race);
  if (race) {
    nextFilters.race = race;
  }

  const setcodes = Array.isArray(draftCard.setcode) ? draftCard.setcode : [];
  for (let index = 0; index < 4; index += 1) {
    const rawValue = Number(setcodes[index] ?? 0);
    if (!Number.isInteger(rawValue) || rawValue <= 0) {
      continue;
    }

    const normalizedSetcode = rawValue.toString(16);
    if (index === 0) nextFilters.setcode1 = normalizedSetcode;
    else if (index === 1) nextFilters.setcode2 = normalizedSetcode;
    else if (index === 2) nextFilters.setcode3 = normalizedSetcode;
    else nextFilters.setcode4 = normalizedSetcode;
  }

  nextFilters.rule = ruleParts.join(' and ');

  return nextFilters;
}

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
