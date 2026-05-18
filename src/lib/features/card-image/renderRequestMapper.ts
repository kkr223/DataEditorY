import { ATTRIBUTE_MAP, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';
import type { CardDataEntry } from '$lib/types';
import type { CardImageFormData } from '$lib/utils/cardImage';

type RustTextGradient = {
  start: string;
  end: string;
};

type RustNameColor =
  | { kind: 'auto' }
  | { kind: 'custom'; value: string };

type RustCardRenderPayload = {
  request: {
    kind: 'yugioh';
    card: Record<string, unknown>;
    options: Record<string, unknown>;
  };
  artImageDataUrl?: string;
  foregroundImageDataUrl?: string;
  passwordText?: string;
};

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

const RENDER_CARD_WIDTH = 1394;
const RENDER_CARD_HEIGHT = 2031;

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

const toFiniteInteger = (value: unknown, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? Math.trunc(next) : fallback;
};

const toUnsignedInteger = (value: unknown, fallback: number) => Math.max(0, toFiniteInteger(value, fallback));

const optionalTrimmed = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const customNameColor = (data: CardImageFormData): RustNameColor => {
  const color = optionalTrimmed(data.color);
  return color ? { kind: 'custom', value: color } : { kind: 'auto' };
};

const gradient = (enabled: boolean, start: string, end: string): RustTextGradient | undefined => {
  const startColor = optionalTrimmed(start);
  const endColor = optionalTrimmed(end);
  return enabled && startColor && endColor ? { start: startColor, end: endColor } : undefined;
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

const buildLinkMarker = (data: CardImageFormData, fallback: number) => {
  if (!Array.isArray(data.arrowList) || data.arrowList.length === 0) {
    return convertSourceLinkMarker(fallback);
  }
  return data.arrowList.reduce((bits, arrow) => bits | (ARROW_TO_LINK_MARKER_BIT[Number(arrow)] ?? 0), 0);
};

const convertSourceLinkMarker = (sourceLinkMarker: number) => SOURCE_LINK_MARKER_BIT_TO_ARROW.reduce(
  (bits, [sourceBit, arrow]) => bits | ((sourceLinkMarker & sourceBit) ? ARROW_TO_LINK_MARKER_BIT[arrow] : 0),
  0,
);

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

const hasForegroundOverlay = (data: CardImageFormData) => Boolean(
  data.foregroundImage.trim()
    && data.foregroundWidth > 0
    && data.foregroundHeight > 0
    && data.foregroundScale > 0,
);

const createForegroundOverlayDataUrl = async (
  data: CardImageFormData,
  foregroundImageUrl = '',
) => {
  if (!hasForegroundOverlay(data)) return undefined;

  const imageUrl = foregroundImageUrl.trim() || data.foregroundImage.trim();
  if (!imageUrl) return undefined;

  const image = new Image();
  image.src = imageUrl;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = RENDER_CARD_WIDTH;
  canvas.height = RENDER_CARD_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(data.foregroundX, data.foregroundY);
  context.rotate((data.foregroundRotation * Math.PI) / 180);
  context.scale(data.foregroundScale, data.foregroundScale);
  context.drawImage(
    image,
    -data.foregroundWidth / 2,
    -data.foregroundHeight / 2,
    data.foregroundWidth,
    data.foregroundHeight,
  );
  context.restore();

  return canvas.toDataURL('image/png');
};

const rareType = (data: CardImageFormData) => optionalTrimmed(data.rare) ?? undefined;

type RustCardRenderOptions = {
  foregroundImageUrl?: string;
};

export const createRustCardRenderPayload = async (
  sourceCard: CardDataEntry,
  data: CardImageFormData,
  options: RustCardRenderOptions = {},
): Promise<RustCardRenderPayload> => {
  const isMonster = data.type === 'monster' || data.type === 'pendulum';
  const isXyz = data.type === 'pendulum'
    ? data.pendulumType === 'xyz-pendulum'
    : data.type === 'monster' && data.cardType === 'xyz';
  const cardTypeBits = buildTypeBits(sourceCard, data);
  const code = parsePasswordCode(data.password, sourceCard.code);
  const effectBlockEnabled = hasEffectBlock(data);
  const foregroundImageDataUrl = await createForegroundOverlayDataUrl(data, options.foregroundImageUrl);

  return {
    request: {
      kind: 'yugioh',
      card: {
        code,
        alias: sourceCard.alias ?? 0,
        setcode: sourceCard.setcode ?? [],
        type: cardTypeBits,
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
        ruleCode: sourceCard.ruleCode ?? 0,
        rare: rareType(data),
        nameColor: customNameColor(data),
        nameGradient: gradient(data.gradient, data.gradientColor1, data.gradientColor2),
        nameShadowColor: optionalTrimmed(data.nameShadowColor),
        nameShadowGradient: gradient(data.nameShadowGradient, data.nameShadowGradientColor1, data.nameShadowGradientColor2),
        package: optionalTrimmed(data.package),
        copyright: optionalTrimmed(data.copyright),
        laser: optionalTrimmed(data.laser),
        twentieth: Boolean(data.twentieth),
        outFrame: effectBlockEnabled,
        outFrameEffectEnabled: effectBlockEnabled,
        outFrameEffectBackgroundColor: effectBlockEnabled ? data.effectBlockColor : undefined,
        outFrameEffectOpacity: effectBlockEnabled ? data.effectBlockOpacity : undefined,
      },
      options: {
        language: data.language,
        artImage: null,
        foregroundImage: null,
        scale: Math.max(Number(data.scale) || 1, 0.01),
        descriptionColorOverride: null,
        titleWidthCompress: false,
        descriptionFirstLineCompress: Boolean(data.firstLineCompress),
        textColors: {},
        layoutOverrides: {},
      },
    },
    artImageDataUrl: data.image.trim() || undefined,
    foregroundImageDataUrl,
    passwordText: data.password.trim() || undefined,
  };
};
