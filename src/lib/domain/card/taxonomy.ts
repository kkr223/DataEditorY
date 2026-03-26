import type { BitOption, LinkMarkerOption, SelectOption } from '$lib/types';

export const TYPE_MAP: Record<string, number> = {
  monster: 0x1,
  spell: 0x2,
  trap: 0x4,
};

export const ATTRIBUTE_MAP: Record<string, number> = {
  earth: 0x01,
  water: 0x02,
  fire: 0x04,
  wind: 0x08,
  light: 0x10,
  dark: 0x20,
  divine: 0x40,
};

export const RACE_MAP: Record<string, number> = {
  warrior: 0x1,
  spellcaster: 0x2,
  fairy: 0x4,
  fiend: 0x8,
  zombie: 0x10,
  machine: 0x20,
  aqua: 0x40,
  pyro: 0x80,
  rock: 0x100,
  wingedbeast: 0x200,
  plant: 0x400,
  insect: 0x800,
  thunder: 0x1000,
  dragon: 0x2000,
  beast: 0x4000,
  beastwarrior: 0x8000,
  dinosaur: 0x10000,
  fish: 0x20000,
  seaserpent: 0x40000,
  reptile: 0x80000,
  psychic: 0x100000,
  divinebeast: 0x200000,
  creatorgod: 0x400000,
  wyrm: 0x800000,
  cyberse: 0x1000000,
  illusion: 0x2000000,
};

// Some subtype bits are shared across main-type families. The main type bit
// determines the final meaning.
export const SUBTYPE_MAP: Record<string, number> = {
  normal: 0x10,
  effect: 0x20,
  fusion: 0x40,
  ritual: 0x80,
  spirit: 0x200,
  union: 0x400,
  gemini: 0x800,
  tuner: 0x1000,
  synchro: 0x2000,
  token: 0x4000,
  quickplay: 0x10000,
  continuous_spell: 0x20000,
  equip: 0x40000,
  field: 0x80000,
  counter: 0x100000,
  flip: 0x200000,
  toon: 0x400000,
  xyz: 0x800000,
  pendulum: 0x1000000,
  spssummon: 0x2000000,
  link: 0x4000000,
  continuous_trap: 0x20000,
  ritual_spell: 0x80,
};

export const SPELL_SUBTYPE_MASK = 0x10000 | 0x20000 | 0x40000 | 0x80000 | 0x80;
export const TRAP_SUBTYPE_MASK = 0x20000 | 0x100000;

export const LINK_MARKER_NAME_TO_BIT: Record<string, number> = {
  downleft: 0x01,
  down: 0x02,
  downright: 0x04,
  left: 0x08,
  right: 0x20,
  upleft: 0x40,
  up: 0x80,
  upright: 0x100,
};

export const TYPE_BITS: BitOption[] = [
  { bit: TYPE_MAP.monster, key: 'editor.subtype.monster' },
  { bit: TYPE_MAP.spell, key: 'editor.subtype.spell' },
  { bit: TYPE_MAP.trap, key: 'editor.subtype.trap' },
  { bit: SUBTYPE_MAP.normal, key: 'editor.subtype.normal' },
  { bit: SUBTYPE_MAP.effect, key: 'editor.subtype.effect' },
  { bit: SUBTYPE_MAP.fusion, key: 'editor.subtype.fusion' },
  { bit: SUBTYPE_MAP.ritual, key: 'editor.subtype.ritual' },
  { bit: SUBTYPE_MAP.spirit, key: 'editor.subtype.spirit' },
  { bit: SUBTYPE_MAP.union, key: 'editor.subtype.union' },
  { bit: SUBTYPE_MAP.gemini, key: 'editor.subtype.gemini' },
  { bit: SUBTYPE_MAP.tuner, key: 'editor.subtype.tuner' },
  { bit: SUBTYPE_MAP.synchro, key: 'editor.subtype.synchro' },
  { bit: SUBTYPE_MAP.token, key: 'editor.subtype.token' },
  { bit: SUBTYPE_MAP.quickplay, key: 'editor.subtype.quickplay' },
  { bit: SUBTYPE_MAP.continuous_spell, key: 'editor.subtype.continuous' },
  { bit: SUBTYPE_MAP.equip, key: 'editor.subtype.equip' },
  { bit: SUBTYPE_MAP.field, key: 'editor.subtype.field' },
  { bit: SUBTYPE_MAP.counter, key: 'editor.subtype.counter' },
  { bit: SUBTYPE_MAP.flip, key: 'editor.subtype.flip' },
  { bit: SUBTYPE_MAP.toon, key: 'editor.subtype.toon' },
  { bit: SUBTYPE_MAP.xyz, key: 'editor.subtype.xyz' },
  { bit: SUBTYPE_MAP.pendulum, key: 'editor.subtype.pendulum' },
  { bit: SUBTYPE_MAP.spssummon, key: 'editor.subtype.spssummon' },
  { bit: SUBTYPE_MAP.link, key: 'editor.subtype.link' },
];

export const LINK_MARKERS: LinkMarkerOption[] = [
  { bit: LINK_MARKER_NAME_TO_BIT.downleft, label: '↙', row: 2, col: 0 },
  { bit: LINK_MARKER_NAME_TO_BIT.down, label: '↓', row: 2, col: 1 },
  { bit: LINK_MARKER_NAME_TO_BIT.downright, label: '↘', row: 2, col: 2 },
  { bit: LINK_MARKER_NAME_TO_BIT.left, label: '←', row: 1, col: 0 },
  { bit: LINK_MARKER_NAME_TO_BIT.right, label: '→', row: 1, col: 2 },
  { bit: LINK_MARKER_NAME_TO_BIT.upleft, label: '↖', row: 0, col: 0 },
  { bit: LINK_MARKER_NAME_TO_BIT.up, label: '↑', row: 0, col: 1 },
  { bit: LINK_MARKER_NAME_TO_BIT.upright, label: '↗', row: 0, col: 2 },
];

export const RACE_OPTIONS: SelectOption<number>[] = [
  { value: 0, key: 'search.na' },
  { value: RACE_MAP.warrior, key: 'search.races.warrior' },
  { value: RACE_MAP.spellcaster, key: 'search.races.spellcaster' },
  { value: RACE_MAP.fairy, key: 'search.races.fairy' },
  { value: RACE_MAP.fiend, key: 'search.races.fiend' },
  { value: RACE_MAP.zombie, key: 'search.races.zombie' },
  { value: RACE_MAP.machine, key: 'search.races.machine' },
  { value: RACE_MAP.aqua, key: 'search.races.aqua' },
  { value: RACE_MAP.pyro, key: 'search.races.pyro' },
  { value: RACE_MAP.rock, key: 'search.races.rock' },
  { value: RACE_MAP.wingedbeast, key: 'search.races.wingedbeast' },
  { value: RACE_MAP.plant, key: 'search.races.plant' },
  { value: RACE_MAP.insect, key: 'search.races.insect' },
  { value: RACE_MAP.thunder, key: 'search.races.thunder' },
  { value: RACE_MAP.dragon, key: 'search.races.dragon' },
  { value: RACE_MAP.beast, key: 'search.races.beast' },
  { value: RACE_MAP.beastwarrior, key: 'search.races.beastwarrior' },
  { value: RACE_MAP.dinosaur, key: 'search.races.dinosaur' },
  { value: RACE_MAP.fish, key: 'search.races.fish' },
  { value: RACE_MAP.seaserpent, key: 'search.races.seaserpent' },
  { value: RACE_MAP.reptile, key: 'search.races.reptile' },
  { value: RACE_MAP.psychic, key: 'search.races.psychic' },
  { value: RACE_MAP.divinebeast, key: 'search.races.divinebeast' },
  { value: RACE_MAP.creatorgod, key: 'search.races.creatorgod' },
  { value: RACE_MAP.wyrm, key: 'search.races.wyrm' },
  { value: RACE_MAP.cyberse, key: 'search.races.cyberse' },
  { value: RACE_MAP.illusion, key: 'search.races.illusion' },
];

export const PERMISSION_OPTIONS: SelectOption<number>[] = [
  { value: 0, label: 'N/A' },
  { value: 1, label: 'OCG' },
  { value: 2, label: 'TCG' },
  { value: 3, label: 'OCG/TCG' },
  { value: 4, label: 'Custom' },
  { value: 9, label: '简体中文' },
  { value: 11, label: '简体中文/TCG' },
];

export const ATTRIBUTE_OPTIONS: SelectOption<number>[] = [
  { value: 0, key: 'search.na' },
  { value: ATTRIBUTE_MAP.earth, key: 'search.attributes.earth' },
  { value: ATTRIBUTE_MAP.water, key: 'search.attributes.water' },
  { value: ATTRIBUTE_MAP.fire, key: 'search.attributes.fire' },
  { value: ATTRIBUTE_MAP.wind, key: 'search.attributes.wind' },
  { value: ATTRIBUTE_MAP.light, key: 'search.attributes.light' },
  { value: ATTRIBUTE_MAP.dark, key: 'search.attributes.dark' },
  { value: ATTRIBUTE_MAP.divine, key: 'search.attributes.divine' },
];

export function getCardTypeKey(type: number): string {
  if (type & TYPE_MAP.monster) return 'search.types.monster';
  if (type & TYPE_MAP.spell) return 'search.types.spell';
  if (type & TYPE_MAP.trap) return 'search.types.trap';
  return 'search.na';
}
