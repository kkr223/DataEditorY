import en from "$lib/i18n/locales/en.json";
import zh from "$lib/i18n/locales/zh.json";
import type { CardDataEntry } from "$lib/types";
import { LINK_MARKER_NAME_TO_BIT, RACE_MAP, SUBTYPE_MAP, TYPE_MAP } from "$lib/domain/card/taxonomy";

// Unicode fullwidth ↔ halfwidth conversion constants
const FULLWIDTH_DIGIT_ZERO = 0xff10; // ０ (65296)
const FULLWIDTH_DIGIT_NINE = 0xff19; // ９ (65305)
const HALFWIDTH_DIGIT_ZERO = 0x30; // 0 (48)
const HALFWIDTH_DIGIT_NINE = 0x39; // 9 (57)
const FULLWIDTH_HALFWIDTH_OFFSET = 0xfee0; // 65248
const FULLWIDTH_LATIN_A_UPPER = 0xff21; // Ａ (65313)
const FULLWIDTH_LATIN_Z_UPPER = 0xff3a; // Ｚ (65338)
const FULLWIDTH_LATIN_A_LOWER = 0xff41; // ａ (65345)
const FULLWIDTH_LATIN_Z_LOWER = 0xff5a; // ｚ (65370)

export type CardImageLanguage = "sc" | "tc" | "jp" | "kr" | "en" | "astral";

export interface CardImageBaseData {
  language: CardImageLanguage;
  font: string;
  name: string;
  color: string;
  align: string;
  gradient: boolean;
  gradientColor1: string;
  gradientColor2: string;
  type: string;
  attribute: string;
  icon: string;
  image: string;
  cardType: string;
  pendulumType: string;
  level: number;
  rank: number;
  pendulumScale: number;
  pendulumDescription: string;
  monsterType: string;
  atkBar: boolean;
  atk: number;
  def: number;
  arrowList: number[];
  description: string;
  firstLineCompress: boolean;
  descriptionAlign: boolean;
  descriptionZoom: number;
  descriptionWeight: number;
  package: string;
  password: string;
  copyright: string;
  laser: string;
  rare: string;
  twentieth: boolean;
  radius: boolean;
  scale: number;
}

type RaceKey = keyof typeof RACE_MAP;
type MonsterSubtypeKey =
  | "fusion"
  | "synchro"
  | "link"
  | "xyz"
  | "ritual"
  | "spssummon"
  | "pendulum"
  | "spirit"
  | "gemini"
  | "union"
  | "flip"
  | "toon"
  | "tuner";

type LocaleStrings = {
  races: Record<RaceKey, string>;
  monsterTypes: Record<MonsterSubtypeKey | "effect" | "normal", string>;
};

const MONSTER_TYPE_ORDER: Array<[MonsterSubtypeKey, number]> = [
  ["fusion", SUBTYPE_MAP.fusion],
  ["synchro", SUBTYPE_MAP.synchro],
  ["link", SUBTYPE_MAP.link],
  ["xyz", SUBTYPE_MAP.xyz],
  ["ritual", SUBTYPE_MAP.ritual],
  ["spssummon", SUBTYPE_MAP.spssummon],
  ["pendulum", SUBTYPE_MAP.pendulum],
  ["spirit", SUBTYPE_MAP.spirit],
  ["gemini", SUBTYPE_MAP.gemini],
  ["union", SUBTYPE_MAP.union],
  ["flip", SUBTYPE_MAP.flip],
  ["toon", SUBTYPE_MAP.toon],
  ["tuner", SUBTYPE_MAP.tuner],
];

const LINK_MARKER_TO_ARROW: Array<[number, number]> = [
  [LINK_MARKER_NAME_TO_BIT.up, 1],
  [LINK_MARKER_NAME_TO_BIT.upright, 2],
  [LINK_MARKER_NAME_TO_BIT.right, 3],
  [LINK_MARKER_NAME_TO_BIT.downright, 4],
  [LINK_MARKER_NAME_TO_BIT.down, 5],
  [LINK_MARKER_NAME_TO_BIT.downleft, 6],
  [LINK_MARKER_NAME_TO_BIT.left, 7],
  [LINK_MARKER_NAME_TO_BIT.upleft, 8],
];

const SC_STRINGS: LocaleStrings = {
  races: zh.search.races as Record<RaceKey, string>,
  monsterTypes: {
    fusion: zh.search.subtypes_monster.fusion,
    synchro: zh.search.subtypes_monster.synchro,
    link: zh.search.subtypes_monster.link,
    xyz: zh.search.subtypes_monster.xyz,
    ritual: zh.search.subtypes_monster.ritual,
    spssummon: zh.search.subtypes_monster.spssummon,
    pendulum: zh.search.subtypes_monster.pendulum,
    spirit: zh.search.subtypes_monster.spirit,
    gemini: zh.search.subtypes_monster.gemini,
    union: zh.search.subtypes_monster.union,
    flip: zh.search.subtypes_monster.flip,
    toon: zh.search.subtypes_monster.toon,
    tuner: zh.search.subtypes_monster.tuner,
    effect: zh.search.subtypes_monster.effect,
    normal: zh.search.subtypes_monster.normal,
  },
};

const TC_STRINGS: LocaleStrings = {
  races: {
    warrior: "戰士族",
    spellcaster: "魔法使族",
    fairy: "天使族",
    fiend: "惡魔族",
    zombie: "不死族",
    machine: "機械族",
    aqua: "水族",
    pyro: "炎族",
    rock: "岩石族",
    wingedbeast: "鳥獸族",
    plant: "植物族",
    insect: "昆蟲族",
    thunder: "雷族",
    dragon: "龍族",
    beast: "獸族",
    beastwarrior: "獸戰士族",
    dinosaur: "恐龍族",
    fish: "魚族",
    seaserpent: "海龍族",
    reptile: "爬蟲類族",
    psychic: "念動力族",
    divinebeast: "幻神獸族",
    creatorgod: "創造神族",
    wyrm: "幻龍族",
    cyberse: "電子界族",
    illusion: "幻想魔族",
  },
  monsterTypes: {
    fusion: "融合",
    synchro: "同步",
    link: "連結",
    xyz: "超量",
    ritual: "儀式",
    spssummon: "特殊召喚",
    pendulum: "靈擺",
    spirit: "靈魂",
    gemini: "二重",
    union: "同盟",
    flip: "反轉",
    toon: "卡通",
    tuner: "調整",
    effect: "效果",
    normal: "通常",
  },
};

const JP_STRINGS: LocaleStrings = {
  races: {
    warrior: "戦士",
    spellcaster: "魔法使い",
    fairy: "天使",
    fiend: "悪魔",
    zombie: "アンデット",
    machine: "機械",
    aqua: "水",
    pyro: "炎",
    rock: "岩石",
    wingedbeast: "鳥獣",
    plant: "植物",
    insect: "昆虫",
    thunder: "雷",
    dragon: "ドラゴン",
    beast: "獣",
    beastwarrior: "獣戦士",
    dinosaur: "恐竜",
    fish: "魚",
    seaserpent: "海竜",
    reptile: "爬虫類",
    psychic: "サイキック",
    divinebeast: "幻神獣",
    creatorgod: "創造神",
    wyrm: "幻竜",
    cyberse: "サイバース",
    illusion: "幻想魔",
  },
  monsterTypes: {
    fusion: "融合",
    synchro: "シンクロ",
    link: "リンク",
    xyz: "エクシーズ",
    ritual: "儀式",
    spssummon: "特殊召喚",
    pendulum: "ペンデュラム",
    spirit: "スピリット",
    gemini: "デュアル",
    union: "ユニオン",
    flip: "リバース",
    toon: "トゥーン",
    tuner: "チューナー",
    effect: "効果",
    normal: "通常",
  },
};

const KR_STRINGS: LocaleStrings = {
  races: {
    warrior: "전사",
    spellcaster: "마법사",
    fairy: "천사",
    fiend: "악마",
    zombie: "언데드",
    machine: "기계",
    aqua: "물",
    pyro: "화염",
    rock: "암석",
    wingedbeast: "비행야수",
    plant: "식물",
    insect: "곤충",
    thunder: "번개",
    dragon: "드래곤",
    beast: "야수",
    beastwarrior: "야수전사",
    dinosaur: "공룡",
    fish: "어류",
    seaserpent: "해룡",
    reptile: "파충류",
    psychic: "사이킥",
    divinebeast: "환신야수",
    creatorgod: "창조신",
    wyrm: "환룡",
    cyberse: "사이버스",
    illusion: "환상마",
  },
  monsterTypes: {
    fusion: "융합",
    synchro: "싱크로",
    link: "링크",
    xyz: "엑시즈",
    ritual: "의식",
    spssummon: "특수 소환",
    pendulum: "펜듈럼",
    spirit: "스피릿",
    gemini: "듀얼",
    union: "유니온",
    flip: "리버스",
    toon: "툰",
    tuner: "튜너",
    effect: "효과",
    normal: "일반",
  },
};

const EN_STRINGS: LocaleStrings = {
  races: en.search.races as Record<RaceKey, string>,
  monsterTypes: {
    fusion: en.search.subtypes_monster.fusion,
    synchro: en.search.subtypes_monster.synchro,
    link: en.search.subtypes_monster.link,
    xyz: en.search.subtypes_monster.xyz,
    ritual: en.search.subtypes_monster.ritual,
    spssummon: en.search.subtypes_monster.spssummon,
    pendulum: en.search.subtypes_monster.pendulum,
    spirit: en.search.subtypes_monster.spirit,
    gemini: en.search.subtypes_monster.gemini,
    union: en.search.subtypes_monster.union,
    flip: en.search.subtypes_monster.flip,
    toon: en.search.subtypes_monster.toon,
    tuner: en.search.subtypes_monster.tuner,
    effect: en.search.subtypes_monster.effect,
    normal: en.search.subtypes_monster.normal,
  },
};

type LocaleConfig = {
  strings: LocaleStrings;
  monsterTypeSeparator: string;
  monsterEffectPattern: RegExp;
  pendulumHeaderPattern: RegExp;
  useFullWidthNumbers: boolean;
  stripTrailingPendulumRule?: RegExp;
};

const LOCALE_CONFIGS: Record<CardImageLanguage, LocaleConfig> = {
  sc: {
    strings: SC_STRINGS,
    monsterTypeSeparator: "/",
    monsterEffectPattern: /【怪兽效果】|【怪兽描述】/,
    pendulumHeaderPattern: /^←\d+\s*【灵摆】\s*\d+→\n?/,
    useFullWidthNumbers: true,
  },
  astral: {
    strings: SC_STRINGS,
    monsterTypeSeparator: "/",
    monsterEffectPattern: /【怪兽效果】|【怪兽描述】/,
    pendulumHeaderPattern: /^←\d+\s*【灵摆】\s*\d+→\n?/,
    useFullWidthNumbers: true,
  },
  tc: {
    strings: TC_STRINGS,
    monsterTypeSeparator: "／",
    monsterEffectPattern: /【怪獸效果】|【怪獸描述】/,
    pendulumHeaderPattern: /^【靈擺效果】\n?|^←\d+\s*【靈擺】\s*\d+→\n?/,
    useFullWidthNumbers: false,
  },
  jp: {
    strings: JP_STRINGS,
    monsterTypeSeparator: "／",
    monsterEffectPattern: /【モンスター効果】/,
    pendulumHeaderPattern: /^【Ｐスケール：青[\d０-９]+／赤[\d０-９]+】\n?/,
    useFullWidthNumbers: true,
  },
  kr: {
    strings: KR_STRINGS,
    monsterTypeSeparator: " / ",
    monsterEffectPattern: /【몬스터 효과】/,
    pendulumHeaderPattern: /^【펜듈럼 효과】\n?/,
    useFullWidthNumbers: false,
  },
  en: {
    strings: EN_STRINGS,
    monsterTypeSeparator: "/",
    monsterEffectPattern: /\[\s*Monster Effect\s*\]/,
    pendulumHeaderPattern: /^\[\s*Pendulum Effect\s*\]\n?|^Pendulum Scale\s*=\s*\d+\n?/,
    useFullWidthNumbers: false,
    stripTrailingPendulumRule: /-{3,}\s*$/,
  },
};

function numberToHalf(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= FULLWIDTH_DIGIT_ZERO && code <= FULLWIDTH_DIGIT_NINE) {
        return String.fromCharCode(code - FULLWIDTH_HALFWIDTH_OFFSET);
      }
      return char;
    })
    .join("");
}

function numberToFull(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= HALFWIDTH_DIGIT_ZERO && code <= HALFWIDTH_DIGIT_NINE) {
        return String.fromCharCode(code + FULLWIDTH_HALFWIDTH_OFFSET);
      }
      return char;
    })
    .join("");
}

function characterToHalf(value: string): string {
  const charList = Array.from(value).map((char) => {
    const code = char.charCodeAt(0);
    if (char === "\u3000") return " ";
    if (char === "\uFE52") return "\u00B7";
    if (
      ["\uFF20", "\uFF0E", "\uFF06", "\uFF1F", "\uFF01"].includes(char) ||
      (code >= FULLWIDTH_LATIN_A_UPPER && code <= FULLWIDTH_LATIN_Z_UPPER) ||
      (code >= FULLWIDTH_LATIN_A_LOWER && code <= FULLWIDTH_LATIN_Z_LOWER)
    ) {
      return String.fromCharCode(code - FULLWIDTH_HALFWIDTH_OFFSET);
    }
    return char;
  });
  return charList.join("").replace(/\u300C.*?\u300D/g, (text) => numberToHalf(text));
}

function normalizeTextWidth(text: string, useFullWidthNumbers: boolean): string {
  if (!useFullWidthNumbers) return text;
  return numberToFull(text).replace(/(\u300C.*?\u300D)|(\u201C.*?\u201D)/g, (segment) => numberToHalf(segment));
}

function getRaceKey(race: number): RaceKey | null {
  for (const [key, bit] of Object.entries(RACE_MAP) as Array<[RaceKey, number]>) {
    if (race & bit) return key;
  }
  return null;
}

function parseType(type: number): CardImageBaseData["type"] {
  if (type & SUBTYPE_MAP.pendulum) return "pendulum";
  if (type & TYPE_MAP.trap) return "trap";
  if (type & TYPE_MAP.spell) return "spell";
  return "monster";
}

function parseAttribute(attribute: number): string {
  if (attribute & 0x40) return "divine";
  if (attribute & 0x20) return "dark";
  if (attribute & 0x10) return "light";
  if (attribute & 0x08) return "wind";
  if (attribute & 0x04) return "fire";
  if (attribute & 0x02) return "water";
  if (attribute & 0x01) return "earth";
  return "";
}

function parseIcon(type: number): string {
  if (type & SUBTYPE_MAP.counter) return "counter";
  if (type & SUBTYPE_MAP.field) return "field";
  if (type & SUBTYPE_MAP.equip) return "equip";
  if (type & SUBTYPE_MAP.continuous_spell || type & SUBTYPE_MAP.continuous_trap) return "continuous";
  if (type & SUBTYPE_MAP.quickplay) return "quick-play";
  if (type & SUBTYPE_MAP.ritual && type & TYPE_MAP.spell) return "ritual";
  return "";
}

function parseCardType(type: number): CardImageBaseData["cardType"] {
  if (type & SUBTYPE_MAP.link) return "link";
  if (type & SUBTYPE_MAP.xyz) return "xyz";
  if (type & SUBTYPE_MAP.token) return "token";
  if (type & SUBTYPE_MAP.synchro) return "synchro";
  if (type & SUBTYPE_MAP.ritual && type & TYPE_MAP.monster) return "ritual";
  if (type & SUBTYPE_MAP.fusion) return "fusion";
  if (type & SUBTYPE_MAP.effect) return "effect";
  return "normal";
}

function parsePendulumType(type: number): CardImageBaseData["pendulumType"] {
  if (!(type & SUBTYPE_MAP.pendulum)) return "normal-pendulum";
  if (type & SUBTYPE_MAP.xyz) return "xyz-pendulum";
  if (type & SUBTYPE_MAP.synchro) return "synchro-pendulum";
  if (type & SUBTYPE_MAP.ritual) return "ritual-pendulum";
  if (type & SUBTYPE_MAP.fusion) return "fusion-pendulum";
  if (type & SUBTYPE_MAP.effect) return "effect-pendulum";
  return "normal-pendulum";
}

function parseArrowList(linkMarker: number): number[] {
  const arrows: number[] = [];
  for (const [bit, arrow] of LINK_MARKER_TO_ARROW) {
    if (linkMarker & bit) arrows.push(arrow);
  }
  return arrows;
}

function parseAttack(value: number): number {
  return value === -2 ? -1 : value;
}

function parseDefense(value: number): number {
  return value === -2 ? -1 : value;
}

function parsePassword(code: number): string {
  return String(code ?? "").padStart(8, "0");
}

function buildMonsterType(race: number, type: number, language: CardImageLanguage): string {
  const config = LOCALE_CONFIGS[language];
  const raceKey = getRaceKey(race);
  if (!raceKey) return "";

  const parts: string[] = [config.strings.races[raceKey]];
  for (const [key, bit] of MONSTER_TYPE_ORDER) {
    if (type & bit) {
      parts.push(config.strings.monsterTypes[key]);
    }
  }

  if (type & SUBTYPE_MAP.effect) {
    parts.push(config.strings.monsterTypes.effect);
  } else if (type & SUBTYPE_MAP.normal) {
    parts.push(config.strings.monsterTypes.normal);
  }

  return parts.join(config.monsterTypeSeparator);
}

function splitPendulumDescription(desc: string, language: CardImageLanguage) {
  const config = LOCALE_CONFIGS[language];
  const parts = desc.split(config.monsterEffectPattern);
  const pendulumDescription = (parts[0] || "").replace(config.pendulumHeaderPattern, "").trim();
  const monsterDescription = parts.slice(1).join("").trim();
  return { pendulumDescription, monsterDescription };
}

function formatPendulumDescription(text: string, language: CardImageLanguage): string {
  const config = LOCALE_CONFIGS[language];
  let result = characterToHalf(text)
    .replace(/'''/g, "")
    .replace(/\r/g, "\n")
    .replace(/\d+→/g, "")
    .replace(/\n/g, "");

  if (config.stripTrailingPendulumRule) {
    result = result.replace(config.stripTrailingPendulumRule, "");
  }

  return normalizeTextWidth(result, config.useFullWidthNumbers).trim();
}

function formatMonsterDescription(text: string, cardType: string, language: CardImageLanguage): string {
  const config = LOCALE_CONFIGS[language];
  let result = characterToHalf(text)
    .replace(/'''/g, "")
    .replace(/\r/g, "\n")
    .replace(/\n{2,}/g, "\n");

  if (["fusion", "synchro", "xyz", "link", "token"].includes(cardType)) {
    let lineBreakCount = 0;
    result = Array.from(result)
      .map((char) => {
        if (char === "\n") {
          if (lineBreakCount > 0) return "";
          lineBreakCount += 1;
        }
        return char;
      })
      .join("");
  } else {
    result = result.replace(/\n/g, "");
  }

  return normalizeTextWidth(result, config.useFullWidthNumbers).trim();
}

function processName(name: string): string {
  return numberToHalf(characterToHalf(name));
}

function processDescription(desc: string, isPendulum: boolean, cardType: string, language: CardImageLanguage) {
  if (!isPendulum) {
    return {
      description: formatMonsterDescription(desc, cardType, language),
      pendulumDescription: "",
    };
  }

  const split = splitPendulumDescription(desc, language);
  return {
    description: formatMonsterDescription(split.monsterDescription, cardType, language),
    pendulumDescription: formatPendulumDescription(split.pendulumDescription, language),
  };
}

export function convertCardDataToCardImageData(
  card: CardDataEntry,
  extras: Partial<CardImageBaseData> = {},
): Partial<CardImageBaseData> {
  const language = extras.language ?? "sc";
  const type = parseType(card.type);
  const cardType = parseCardType(card.type);
  const isPendulum = type === "pendulum";
  const isMonster = type === "monster" || isPendulum;
  const { description, pendulumDescription } = processDescription(card.desc, isPendulum, cardType, language);
  const hasLineBreak = description.includes("\n");

  return {
    language,
    name: processName(card.name),
    type,
    attribute: parseAttribute(card.attribute),
    icon: parseIcon(card.type),
    cardType,
    pendulumType: parsePendulumType(card.type),
    level: card.level,
    rank: card.level,
    pendulumScale: card.lscale,
    pendulumDescription,
    monsterType: isMonster ? buildMonsterType(card.race, card.type, language) : "",
    atkBar: isMonster,
    atk: parseAttack(card.attack),
    def: parseDefense(card.defense),
    arrowList: parseArrowList(card.linkMarker),
    description,
    firstLineCompress: isMonster && hasLineBreak && ["fusion", "synchro", "xyz", "link"].includes(cardType),
    password: parsePassword(card.code),
    ...extras,
  };
}
