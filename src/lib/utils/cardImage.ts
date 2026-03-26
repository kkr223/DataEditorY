import { cdbToYugiohCard, type YugiohCardData as BaseYugiohCardData } from "cdb2yugiohcard";
import type { CardDataEntry } from "$lib/types";

export type CardImageFormData = BaseYugiohCardData & {
  foregroundImage: string;
  foregroundWidth: number;
  foregroundHeight: number;
  foregroundX: number;
  foregroundY: number;
  foregroundScale: number;
  foregroundRotation: number;
  nameShadowColor: string;
  nameShadowGradient: boolean;
  nameShadowGradientColor1: string;
  nameShadowGradientColor2: string;
};
export type CardImageLanguage = BaseYugiohCardData["language"];

type StringOption = {
  value: string;
  label?: string;
  labelKey?: string;
};

const DEFAULT_CARD_IMAGE_FORM_DATA: CardImageFormData = {
  language: "sc",
  font: "",
  name: "",
  color: "",
  align: "left",
  gradient: false,
  gradientColor1: "#999999",
  gradientColor2: "#ffffff",
  type: "monster",
  attribute: "",
  icon: "",
  image: "",
  cardType: "normal",
  pendulumType: "effect-pendulum",
  level: 0,
  rank: 0,
  pendulumScale: 0,
  pendulumDescription: "",
  monsterType: "",
  atkBar: true,
  atk: 0,
  def: 0,
  arrowList: [],
  description: "",
  firstLineCompress: false,
  descriptionAlign: false,
  descriptionZoom: 1,
  descriptionWeight: 0,
  package: "",
  password: "",
  copyright: "sc",
  laser: "",
  rare: "",
  twentieth: false,
  radius: true,
  scale: 1,
  foregroundImage: "",
  foregroundWidth: 0,
  foregroundHeight: 0,
  foregroundX: 697,
  foregroundY: 1015.5,
  foregroundScale: 1,
  foregroundRotation: 0,
  nameShadowColor: "",
  nameShadowGradient: false,
  nameShadowGradientColor1: "#1f2937",
  nameShadowGradientColor2: "#0f172a",
};

export const CARD_IMAGE_LANGUAGE_OPTIONS: StringOption[] = [
  { value: "sc", labelKey: "editor.card_image_option.language.sc" },
  { value: "tc", labelKey: "editor.card_image_option.language.tc" },
  { value: "jp", labelKey: "editor.card_image_option.language.jp" },
  { value: "kr", labelKey: "editor.card_image_option.language.kr" },
  { value: "en", labelKey: "editor.card_image_option.language.en" },
  { value: "astral", labelKey: "editor.card_image_option.language.astral" },
];

export const CARD_IMAGE_FONT_OPTIONS: StringOption[] = [
  { value: "", labelKey: "editor.card_image_option.font.default" },
  { value: "custom1", labelKey: "editor.card_image_option.font.custom1" },
  { value: "custom2", labelKey: "editor.card_image_option.font.custom2" },
];

export const CARD_IMAGE_TYPE_OPTIONS: StringOption[] = [
  { value: "monster", labelKey: "editor.subtype.monster" },
  { value: "spell", labelKey: "editor.subtype.spell" },
  { value: "trap", labelKey: "editor.subtype.trap" },
  { value: "pendulum", labelKey: "editor.subtype.pendulum" },
];

export const CARD_IMAGE_CARD_TYPE_OPTIONS: StringOption[] = [
  { value: "normal", labelKey: "editor.subtype.normal" },
  { value: "effect", labelKey: "editor.subtype.effect" },
  { value: "ritual", labelKey: "editor.subtype.ritual" },
  { value: "fusion", labelKey: "editor.subtype.fusion" },
  { value: "synchro", labelKey: "editor.subtype.synchro" },
  { value: "xyz", labelKey: "editor.subtype.xyz" },
  { value: "link", labelKey: "editor.subtype.link" },
  { value: "token", labelKey: "editor.subtype.token" },
];

export const CARD_IMAGE_PENDULUM_TYPE_OPTIONS: StringOption[] = [
  { value: "normal-pendulum", labelKey: "editor.card_image_option.pendulum_type.normal" },
  { value: "effect-pendulum", labelKey: "editor.card_image_option.pendulum_type.effect" },
  { value: "ritual-pendulum", labelKey: "editor.card_image_option.pendulum_type.ritual" },
  { value: "fusion-pendulum", labelKey: "editor.card_image_option.pendulum_type.fusion" },
  { value: "synchro-pendulum", labelKey: "editor.card_image_option.pendulum_type.synchro" },
  { value: "xyz-pendulum", labelKey: "editor.card_image_option.pendulum_type.xyz" },
];

export const CARD_IMAGE_ATTRIBUTE_OPTIONS: StringOption[] = [
  { value: "", labelKey: "search.na" },
  { value: "dark", labelKey: "search.attributes.dark" },
  { value: "light", labelKey: "search.attributes.light" },
  { value: "earth", labelKey: "search.attributes.earth" },
  { value: "water", labelKey: "search.attributes.water" },
  { value: "fire", labelKey: "search.attributes.fire" },
  { value: "wind", labelKey: "search.attributes.wind" },
  { value: "divine", labelKey: "search.attributes.divine" },
];

export const CARD_IMAGE_ICON_OPTIONS: StringOption[] = [
  { value: "", labelKey: "search.na" },
  { value: "equip", labelKey: "editor.subtype.equip" },
  { value: "field", labelKey: "editor.subtype.field" },
  { value: "quick-play", labelKey: "editor.subtype.quickplay" },
  { value: "ritual", labelKey: "editor.subtype.ritual" },
  { value: "continuous", labelKey: "editor.subtype.continuous" },
  { value: "counter", labelKey: "editor.subtype.counter" },
];

export const CARD_IMAGE_RARE_OPTIONS: StringOption[] = [
  { value: "", labelKey: "search.na" },
  { value: "dt", labelKey: "editor.card_image_option.rare.dt" },
  { value: "ur", labelKey: "editor.card_image_option.rare.ur" },
  { value: "gr", labelKey: "editor.card_image_option.rare.gr" },
  { value: "hr", labelKey: "editor.card_image_option.rare.hr" },
  { value: "ser", labelKey: "editor.card_image_option.rare.ser" },
  { value: "gser", labelKey: "editor.card_image_option.rare.gser" },
  { value: "pser", labelKey: "editor.card_image_option.rare.pser" },
];

export const CARD_IMAGE_LASER_OPTIONS: StringOption[] = [
  { value: "", labelKey: "search.na" },
  { value: "laser1", labelKey: "editor.card_image_option.laser.laser1" },
  { value: "laser2", labelKey: "editor.card_image_option.laser.laser2" },
  { value: "laser3", labelKey: "editor.card_image_option.laser.laser3" },
  { value: "laser4", labelKey: "editor.card_image_option.laser.laser4" },
];

export const CARD_IMAGE_COPYRIGHT_OPTIONS: StringOption[] = [
  { value: "", labelKey: "search.na" },
  { value: "sc", labelKey: "editor.card_image_option.copyright.sc" },
  { value: "jp", labelKey: "editor.card_image_option.copyright.jp" },
  { value: "en", labelKey: "editor.card_image_option.copyright.en" },
];

function coerceNumber(value: unknown, fallback: number): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function normalizeCardImageFormData(data: Partial<CardImageFormData>): CardImageFormData {
  return {
    ...DEFAULT_CARD_IMAGE_FORM_DATA,
    ...data,
    language: String(data.language ?? DEFAULT_CARD_IMAGE_FORM_DATA.language),
    font: String(data.font ?? DEFAULT_CARD_IMAGE_FORM_DATA.font),
    name: String(data.name ?? DEFAULT_CARD_IMAGE_FORM_DATA.name),
    color: String(data.color ?? DEFAULT_CARD_IMAGE_FORM_DATA.color),
    align: String(data.align ?? DEFAULT_CARD_IMAGE_FORM_DATA.align),
    gradient: Boolean(data.gradient ?? DEFAULT_CARD_IMAGE_FORM_DATA.gradient),
    gradientColor1: String(data.gradientColor1 ?? DEFAULT_CARD_IMAGE_FORM_DATA.gradientColor1),
    gradientColor2: String(data.gradientColor2 ?? DEFAULT_CARD_IMAGE_FORM_DATA.gradientColor2),
    type: String(data.type ?? DEFAULT_CARD_IMAGE_FORM_DATA.type),
    attribute: String(data.attribute ?? DEFAULT_CARD_IMAGE_FORM_DATA.attribute),
    icon: String(data.icon ?? DEFAULT_CARD_IMAGE_FORM_DATA.icon),
    image: String(data.image ?? DEFAULT_CARD_IMAGE_FORM_DATA.image),
    cardType: String(data.cardType ?? DEFAULT_CARD_IMAGE_FORM_DATA.cardType),
    pendulumType: String(data.pendulumType ?? DEFAULT_CARD_IMAGE_FORM_DATA.pendulumType),
    level: coerceNumber(data.level, DEFAULT_CARD_IMAGE_FORM_DATA.level),
    rank: coerceNumber(data.rank, DEFAULT_CARD_IMAGE_FORM_DATA.rank),
    pendulumScale: coerceNumber(data.pendulumScale, DEFAULT_CARD_IMAGE_FORM_DATA.pendulumScale),
    pendulumDescription: String(data.pendulumDescription ?? DEFAULT_CARD_IMAGE_FORM_DATA.pendulumDescription),
    monsterType: String(data.monsterType ?? DEFAULT_CARD_IMAGE_FORM_DATA.monsterType),
    atkBar: Boolean(data.atkBar ?? DEFAULT_CARD_IMAGE_FORM_DATA.atkBar),
    atk: coerceNumber(data.atk, DEFAULT_CARD_IMAGE_FORM_DATA.atk),
    def: coerceNumber(data.def, DEFAULT_CARD_IMAGE_FORM_DATA.def),
    arrowList: Array.isArray(data.arrowList) ? [...data.arrowList] : [],
    description: String(data.description ?? DEFAULT_CARD_IMAGE_FORM_DATA.description),
    firstLineCompress: Boolean(data.firstLineCompress ?? DEFAULT_CARD_IMAGE_FORM_DATA.firstLineCompress),
    descriptionAlign: Boolean(data.descriptionAlign ?? DEFAULT_CARD_IMAGE_FORM_DATA.descriptionAlign),
    descriptionZoom: coerceNumber(data.descriptionZoom, DEFAULT_CARD_IMAGE_FORM_DATA.descriptionZoom),
    descriptionWeight: coerceNumber(data.descriptionWeight, DEFAULT_CARD_IMAGE_FORM_DATA.descriptionWeight),
    package: String(data.package ?? DEFAULT_CARD_IMAGE_FORM_DATA.package),
    password: String(data.password ?? DEFAULT_CARD_IMAGE_FORM_DATA.password),
    copyright: String(data.copyright ?? DEFAULT_CARD_IMAGE_FORM_DATA.copyright),
    laser: String(data.laser ?? DEFAULT_CARD_IMAGE_FORM_DATA.laser),
    rare: String(data.rare ?? DEFAULT_CARD_IMAGE_FORM_DATA.rare),
    twentieth: Boolean(data.twentieth ?? DEFAULT_CARD_IMAGE_FORM_DATA.twentieth),
    radius: Boolean(data.radius ?? DEFAULT_CARD_IMAGE_FORM_DATA.radius),
    scale: coerceNumber(data.scale, DEFAULT_CARD_IMAGE_FORM_DATA.scale),
    foregroundImage: String(data.foregroundImage ?? DEFAULT_CARD_IMAGE_FORM_DATA.foregroundImage),
    foregroundWidth: coerceNumber(data.foregroundWidth, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundWidth),
    foregroundHeight: coerceNumber(data.foregroundHeight, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundHeight),
    foregroundX: coerceNumber(data.foregroundX, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundX),
    foregroundY: coerceNumber(data.foregroundY, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundY),
    foregroundScale: coerceNumber(data.foregroundScale, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundScale),
    foregroundRotation: coerceNumber(data.foregroundRotation, DEFAULT_CARD_IMAGE_FORM_DATA.foregroundRotation),
    nameShadowColor: String(data.nameShadowColor ?? DEFAULT_CARD_IMAGE_FORM_DATA.nameShadowColor),
    nameShadowGradient: Boolean(data.nameShadowGradient ?? DEFAULT_CARD_IMAGE_FORM_DATA.nameShadowGradient),
    nameShadowGradientColor1: String(data.nameShadowGradientColor1 ?? DEFAULT_CARD_IMAGE_FORM_DATA.nameShadowGradientColor1),
    nameShadowGradientColor2: String(data.nameShadowGradientColor2 ?? DEFAULT_CARD_IMAGE_FORM_DATA.nameShadowGradientColor2),
  };
}

export function getCardImageLocaleDefaults(
  card: CardDataEntry,
  language: CardImageLanguage = "sc",
): CardImageFormData {
  return normalizeCardImageFormData(cdbToYugiohCard(card as never, {
    language,
    image: "",
    package: "",
    password: String(card.code ?? ""),
    copyright: language === "tc" || language === "astral" ? "sc" : language,
    laser: "",
    rare: "",
    twentieth: false,
    radius: true,
    scale: 1,
    firstLineCompress: false,
    descriptionAlign: false,
    descriptionZoom: 1,
    descriptionWeight: 0,
  }));
}

export function createCardImageFormData(
  card: CardDataEntry,
  language: CardImageLanguage = "sc",
): CardImageFormData {
  return getCardImageLocaleDefaults(card, language);
}
