import { ATTRIBUTE_MAP, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';
import type { CardDataEntry } from '$lib/types';
import type { CardBaseData, DocumentEdit, TextFill } from '$lib/types/render';
import type { CardImageFormData, CardImageLanguage } from '../layout';

const ARROW_TO_LINK_MARKER_BIT: Record<number, number> = {
  1: 0x004,
  2: 0x080,
  3: 0x20,
  4: 0x100,
  5: 0x040,
  6: 0x008,
  7: 0x001,
  8: 0x002,
};

const SOURCE_LINK_MARKER_BIT_TO_ARROW: Array<[number, number]> = [
  [0x80, 1],
  [0x100, 2],
  [0x20, 3],
  [0x04, 4],
  [0x02, 5],
  [0x01, 6],
  [0x08, 7],
  [0x40, 8],
];

const MAX_FOREGROUND_DIMENSION = 4096;
const MAX_FOREGROUND_SCALE = 12;

const MONSTER_DETAIL_MASK = SUBTYPE_MAP.spirit
  | SUBTYPE_MAP.union
  | SUBTYPE_MAP.gemini
  | SUBTYPE_MAP.tuner
  | SUBTYPE_MAP.flip
  | SUBTYPE_MAP.toon
  | SUBTYPE_MAP.spssummon;

const SPECIAL_MONSTER_TYPE_BITS: Record<string, number> = {
  fusion: SUBTYPE_MAP.fusion,
  ritual: SUBTYPE_MAP.ritual,
  synchro: SUBTYPE_MAP.synchro,
  xyz: SUBTYPE_MAP.xyz,
  link: SUBTYPE_MAP.link,
  token: SUBTYPE_MAP.token,
};

const PENDULUM_TYPE_BITS: Record<string, number> = {
  'ritual-pendulum': SUBTYPE_MAP.ritual,
  'fusion-pendulum': SUBTYPE_MAP.fusion,
  'synchro-pendulum': SUBTYPE_MAP.synchro,
  'xyz-pendulum': SUBTYPE_MAP.xyz,
};

const DESCRIPTION_BASE_FONT_SIZE: Record<CardImageLanguage, number> = {
  sc: 36,
  tc: 36,
  jp: 38,
  kr: 36,
  en: 42,
  astral: 42,
};

const toFiniteInteger = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
};

const toUnsignedInteger = (value: unknown, fallback: number) => Math.max(0, toFiniteInteger(value, fallback));

const optionalTrimmed = (value: string | undefined | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : undefined;
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const parsePasswordCode = (password: string, fallback: number) => {
  const normalized = password.trim();
  if (!/^\d+$/.test(normalized)) return fallback;
  return toUnsignedInteger(normalized, fallback);
};

const buildSpellTrapTypeBits = (data: CardImageFormData) => {
  let bits = data.type === 'trap' ? TYPE_MAP.trap : TYPE_MAP.spell;

  switch (data.icon) {
    case 'counter':
      bits |= SUBTYPE_MAP.counter;
      break;
    case 'continuous':
      bits |= data.type === 'trap' ? SUBTYPE_MAP.continuous_trap : SUBTYPE_MAP.continuous_spell;
      break;
    case 'equip':
      bits |= SUBTYPE_MAP.equip;
      break;
    case 'field':
      bits |= SUBTYPE_MAP.field;
      break;
    case 'quick-play':
      bits |= SUBTYPE_MAP.quickplay;
      break;
    case 'ritual':
      if (data.type === 'spell') bits |= SUBTYPE_MAP.ritual;
      break;
  }

  return bits;
};

const buildMonsterTypeBits = (sourceCard: CardDataEntry, data: CardImageFormData) => {
  const isPendulum = data.type === 'pendulum';
  const frameType = isPendulum ? data.pendulumType : data.cardType;
  let bits = TYPE_MAP.monster | (sourceCard.type & MONSTER_DETAIL_MASK);

  if (isPendulum) {
    bits |= SUBTYPE_MAP.pendulum;
  }

  bits |= isPendulum
    ? (PENDULUM_TYPE_BITS[frameType] ?? 0)
    : (SPECIAL_MONSTER_TYPE_BITS[frameType] ?? 0);

  const sourceHasEffect = Boolean(sourceCard.type & SUBTYPE_MAP.effect);
  const sourceHasNormal = Boolean(sourceCard.type & SUBTYPE_MAP.normal);
  const wantsNormal = frameType === 'normal' || frameType === 'normal-pendulum' || frameType === 'token';

  if (wantsNormal) {
    bits |= SUBTYPE_MAP.normal;
  } else if (frameType === 'effect' || frameType === 'effect-pendulum' || sourceHasEffect || !sourceHasNormal) {
    bits |= SUBTYPE_MAP.effect;
  } else if (sourceHasNormal) {
    bits |= SUBTYPE_MAP.normal;
  }

  return bits;
};

const buildTypeBits = (sourceCard: CardDataEntry, data: CardImageFormData) => {
  if (data.type === 'spell' || data.type === 'trap') {
    return buildSpellTrapTypeBits(data);
  }
  return buildMonsterTypeBits(sourceCard, data);
};

const convertSourceLinkMarker = (sourceLinkMarker: number) => SOURCE_LINK_MARKER_BIT_TO_ARROW.reduce(
  (bits, [sourceBit, arrow]) => bits | ((sourceLinkMarker & sourceBit) ? ARROW_TO_LINK_MARKER_BIT[arrow] : 0),
  0,
);

const buildLinkMarker = (data: CardImageFormData, fallback: number) => {
  if (!Array.isArray(data.arrowList) || data.arrowList.length === 0) {
    return convertSourceLinkMarker(fallback);
  }
  return data.arrowList.reduce((bits, arrow) => bits | (ARROW_TO_LINK_MARKER_BIT[Number(arrow)] ?? 0), 0);
};

const buildDescription = (data: CardImageFormData) => {
  if (data.type !== 'pendulum') return data.description;
  return `${data.pendulumDescription}\n【怪兽效果】\n${data.description}`.trim();
};

const hasEffectBlock = (data: CardImageFormData) => Boolean(
  data.effectBlockEnabled
    && data.effectBlockWidth > 0
    && data.effectBlockHeight > 0
    && data.effectBlockOpacity > 0,
);

const foregroundLayout = (data: CardImageFormData) => {
  const centerX = finiteNumber(data.foregroundX);
  const centerY = finiteNumber(data.foregroundY);
  const width = finiteNumber(data.foregroundWidth);
  const height = finiteNumber(data.foregroundHeight);
  const scale = finiteNumber(data.foregroundScale);
  const rotation = finiteNumber(data.foregroundRotation) ?? 0;
  const hasForegroundImage = Boolean(data.foregroundImage.trim());
  if (!hasForegroundImage) return null;

  if (
    centerX === null
    || centerY === null
    || width === null
    || height === null
    || scale === null
    || width <= 0
    || height <= 0
    || scale <= 0
    || width > MAX_FOREGROUND_DIMENSION
    || height > MAX_FOREGROUND_DIMENSION
    || scale > MAX_FOREGROUND_SCALE
  ) {
    return null;
  }

  const renderedWidth = width * scale;
  const renderedHeight = height * scale;

  return {
    x: centerX - renderedWidth / 2,
    y: centerY - renderedHeight / 2,
    width,
    height,
    scale,
    rotation,
  };
};

const buildTextFill = (data: {
  color?: string;
  gradient?: boolean;
  gradientColor1?: string;
  gradientColor2?: string;
}): TextFill | null => {
  const start = optionalTrimmed(data.gradientColor1);
  const end = optionalTrimmed(data.gradientColor2);
  if (data.gradient && start && end) {
    return { gradient: { start, end } };
  }

  const color = optionalTrimmed(data.color);
  return color ? { color } : null;
};

const addOptionalTextEdit = (edits: DocumentEdit[], nodeId: string, text: string) => {
  const trimmed = optionalTrimmed(text);
  if (trimmed) {
    edits.push({ kind: 'setText', node_id: nodeId, text: trimmed });
  }
};

const isMonsterCard = (data: CardImageFormData) => data.type === 'monster' || data.type === 'pendulum';

const isLinkCard = (data: CardImageFormData) => (
  data.type === 'pendulum'
    ? data.pendulumType === 'link-pendulum'
    : data.type === 'monster' && data.cardType === 'link'
);

const displayStat = (value: unknown) => {
  const stat = toFiniteInteger(value, 0);
  if (stat === -2) return 'INF';
  if (stat === -1) return '?';
  return String(stat);
};

const descriptionFontSize = (data: CardImageFormData) => {
  const zoom = Number(data.descriptionZoom);
  const base = DESCRIPTION_BASE_FONT_SIZE[data.language] ?? DESCRIPTION_BASE_FONT_SIZE.sc;
  return Math.max(1, Math.round(base * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1)));
};

const fontWeight = (value: unknown) => {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return Math.round(Math.max(1, Math.min(1000, weight)));
};

export const createCardBaseData = (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
): CardBaseData => {
  const isMonster = isMonsterCard(data);
  const isXyz = data.type === 'pendulum'
    ? data.pendulumType === 'xyz-pendulum'
    : data.type === 'monster' && data.cardType === 'xyz';
  const effectBlockEnabled = hasEffectBlock(data);

  return {
    kind: 'yugioh',
    code: parsePasswordCode(data.password, sourceCard.code),
    alias: sourceCard.alias ?? 0,
    ruleCode: sourceCard.ruleCode ?? 0,
    setcode: sourceCard.setcode ?? [],
    type: buildTypeBits(sourceCard, data),
    attack: isMonster ? toFiniteInteger(data.atk, sourceCard.attack) : 0,
    defense: isMonster ? toFiniteInteger(data.def, sourceCard.defense) : 0,
    level: isXyz
      ? toUnsignedInteger(data.rank, sourceCard.level)
      : toUnsignedInteger(data.level, sourceCard.level),
    race: isMonster ? sourceCard.race : 0,
    attribute: isMonster ? (ATTRIBUTE_MAP[data.attribute] ?? sourceCard.attribute ?? 0) : 0,
    category: sourceCard.category ?? 0,
    ot: sourceCard.ot ?? 0,
    name: data.name,
    desc: buildDescription(data),
    strings: sourceCard.strings ?? [],
    lscale: toUnsignedInteger(data.pendulumScale, sourceCard.lscale),
    rscale: toUnsignedInteger(data.pendulumScale, sourceCard.rscale),
    linkMarker: buildLinkMarker(data, sourceCard.linkMarker),
    rare: optionalTrimmed(data.rare),
    language: data.language,
    font: optionalTrimmed(data.font),
    scale: Math.max(Number(data.scale) || 1, 0.01),
    twentieth: Boolean(data.twentieth),
    twentyFifth: Boolean(data.twentyFifth),
    outFrame: effectBlockEnabled,
    outFrameEffectEnabled: effectBlockEnabled,
    outFrameEffectBackgroundColor: effectBlockEnabled ? data.effectBlockColor : undefined,
    outFrameEffectOpacity: effectBlockEnabled ? data.effectBlockOpacity : undefined,
    radius: Boolean(data.radius),
    atkBar: Boolean(data.atkBar),
    align: data.align === 'center' ? 'center' : data.align === 'right' ? 'right' : 'left',
    descriptionAlign: data.descriptionAlign ? 'center' : undefined,
  };
};

export const createDocumentEdits = (
  _sourceCard: CardDataEntry,
  data: CardImageFormData,
): DocumentEdit[] => {
  const edits: DocumentEdit[] = [
    { kind: 'setText', node_id: 'title', text: data.name },
    { kind: 'setText', node_id: 'description', text: data.description },
    {
      kind: 'setFirstLineCompress',
      node_id: 'description',
      enabled: Boolean(data.firstLineCompress),
    },
  ];

  if (!data.showNameBox) {
    edits.push({ kind: 'setVisible', node_id: 'title', visible: false });
  }

  if (data.type === 'pendulum') {
    edits.push({ kind: 'setText', node_id: 'pendulum-description', text: data.pendulumDescription });
    edits.push({ kind: 'setText', node_id: 'stats-lscale', text: String(toUnsignedInteger(data.pendulumScale, 0)) });
    edits.push({ kind: 'setText', node_id: 'stats-rscale', text: String(toUnsignedInteger(data.pendulumScale, 0)) });
  }

  const monsterType = optionalTrimmed(data.monsterType);
  if (monsterType) {
    const useFullwidthBrackets = ['sc', 'tc', 'jp', 'astral'].includes(data.language);
    const leftBracket = useFullwidthBrackets ? '\u3010' : '[';
    const rightBracket = useFullwidthBrackets ? '\u3011' : ']';
    edits.push({ kind: 'setText', node_id: 'monster-type-line', text: `${leftBracket}${monsterType}${rightBracket}` });
  }

  addOptionalTextEdit(edits, 'password', data.password);
  addOptionalTextEdit(edits, 'package', data.package);
  addOptionalTextEdit(edits, 'copyright', data.copyright);
  addOptionalTextEdit(edits, 'laser', data.laser);

  if (isMonsterCard(data)) {
    edits.push({ kind: 'setText', node_id: 'stats-atk', text: displayStat(data.atk) });
    edits.push({
      kind: 'setText',
      node_id: isLinkCard(data) ? 'stats-link' : 'stats-def',
      text: isLinkCard(data) ? String(toUnsignedInteger(data.level, 0)) : displayStat(data.def),
    });
  }

  const titleFill = buildTextFill(data);
  if (titleFill) {
    edits.push({ kind: 'setTextFill', node_id: 'title', fill: titleFill });
  }

  const titleShadow = buildTextFill({
    color: data.nameShadowColor,
    gradient: data.nameShadowGradient,
    gradientColor1: data.nameShadowGradientColor1,
    gradientColor2: data.nameShadowGradientColor2,
  });
  if (titleShadow) {
    edits.push({ kind: 'setTextShadow', node_id: 'title', shadow: titleShadow });
  }

  if (Number(data.descriptionZoom) !== 1) {
    edits.push({ kind: 'setFontSize', node_id: 'description', size: descriptionFontSize(data) });
  }

  const weight = fontWeight(data.descriptionWeight);
  if (weight !== null) {
    edits.push({ kind: 'setFontWeight', node_id: 'description', weight });
  }

  const foreground = foregroundLayout(data);
  if (foreground) {
    edits.push({ kind: 'setForegroundLayout', node_id: 'foreground', layout: foreground });
  }

  if (data.effectBlockEnabled) {
    edits.push({
      kind: 'setFillRect',
      node_id: 'out-frame-effect-bg',
      color: data.effectBlockColor,
      opacity: data.effectBlockOpacity,
    });
  }

  return edits;
};
