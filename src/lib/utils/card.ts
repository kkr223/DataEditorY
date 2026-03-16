import { CardDataEntry } from 'ygopro-cdb-encode';
import type { BitOption, LinkMarkerOption, SelectOption } from '$lib/types';

export const TYPE_BITS: BitOption[] = [
  { bit: 0x1, key: 'editor.subtype.monster' },
  { bit: 0x2, key: 'editor.subtype.spell' },
  { bit: 0x4, key: 'editor.subtype.trap' },
  { bit: 0x10, key: 'editor.subtype.normal' },
  { bit: 0x20, key: 'editor.subtype.effect' },
  { bit: 0x40, key: 'editor.subtype.fusion' },
  { bit: 0x80, key: 'editor.subtype.ritual' },
  { bit: 0x200, key: 'editor.subtype.spirit' },
  { bit: 0x400, key: 'editor.subtype.union' },
  { bit: 0x800, key: 'editor.subtype.gemini' },
  { bit: 0x1000, key: 'editor.subtype.tuner' },
  { bit: 0x2000, key: 'editor.subtype.synchro' },
  { bit: 0x4000, key: 'editor.subtype.token' },
  { bit: 0x10000, key: 'editor.subtype.quickplay' },
  { bit: 0x20000, key: 'editor.subtype.continuous' },
  { bit: 0x40000, key: 'editor.subtype.equip' },
  { bit: 0x80000, key: 'editor.subtype.field' },
  { bit: 0x100000, key: 'editor.subtype.counter' },
  { bit: 0x200000, key: 'editor.subtype.flip' },
  { bit: 0x400000, key: 'editor.subtype.toon' },
  { bit: 0x800000, key: 'editor.subtype.xyz' },
  { bit: 0x1000000, key: 'editor.subtype.pendulum' },
  { bit: 0x2000000, key: 'editor.subtype.spssummon' },
  { bit: 0x4000000, key: 'editor.subtype.link' },
];

export const LINK_MARKERS: LinkMarkerOption[] = [
  { bit: 0x01, label: '↙', row: 2, col: 0 },
  { bit: 0x02, label: '↓', row: 2, col: 1 },
  { bit: 0x04, label: '↘', row: 2, col: 2 },
  { bit: 0x08, label: '←', row: 1, col: 0 },
  { bit: 0x20, label: '→', row: 1, col: 2 },
  { bit: 0x40, label: '↖', row: 0, col: 0 },
  { bit: 0x80, label: '↑', row: 0, col: 1 },
  { bit: 0x100, label: '↗', row: 0, col: 2 },
];

export const RACE_OPTIONS: SelectOption<number>[] = [
  { value: 0, key: 'search.na' },
  { value: 0x1, key: 'search.races.warrior' },
  { value: 0x2, key: 'search.races.spellcaster' },
  { value: 0x4, key: 'search.races.fairy' },
  { value: 0x8, key: 'search.races.fiend' },
  { value: 0x10, key: 'search.races.zombie' },
  { value: 0x20, key: 'search.races.machine' },
  { value: 0x40, key: 'search.races.aqua' },
  { value: 0x80, key: 'search.races.pyro' },
  { value: 0x100, key: 'search.races.rock' },
  { value: 0x200, key: 'search.races.wingedbeast' },
  { value: 0x400, key: 'search.races.plant' },
  { value: 0x800, key: 'search.races.insect' },
  { value: 0x1000, key: 'search.races.thunder' },
  { value: 0x2000, key: 'search.races.dragon' },
  { value: 0x4000, key: 'search.races.beast' },
  { value: 0x8000, key: 'search.races.beastwarrior' },
  { value: 0x10000, key: 'search.races.dinosaur' },
  { value: 0x20000, key: 'search.races.fish' },
  { value: 0x40000, key: 'search.races.seaserpent' },
  { value: 0x80000, key: 'search.races.reptile' },
  { value: 0x100000, key: 'search.races.psychic' },
  { value: 0x200000, key: 'search.races.divinebeast' },
  { value: 0x400000, key: 'search.races.creatorgod' },
  { value: 0x800000, key: 'search.races.wyrm' },
  { value: 0x1000000, key: 'search.races.cyberse' },
  { value: 0x2000000, key: 'search.races.illusion' },
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
  { value: 0x01, key: 'search.attributes.earth' },
  { value: 0x02, key: 'search.attributes.water' },
  { value: 0x04, key: 'search.attributes.fire' },
  { value: 0x08, key: 'search.attributes.wind' },
  { value: 0x10, key: 'search.attributes.light' },
  { value: 0x20, key: 'search.attributes.dark' },
  { value: 0x40, key: 'search.attributes.divine' },
];

export function getCardTypeKey(type: number): string {
  if (type & 0x1) return 'search.types.monster';
  if (type & 0x2) return 'search.types.spell';
  if (type & 0x4) return 'search.types.trap';
  return 'search.na';
}

export function getPackedLScale(level: number): number {
  return (level >> 24) & 0xff;
}

export function getPackedRScale(level: number): number {
  return (level >> 16) & 0xff;
}

export function getPackedLevel(level: number): number {
  return level & 0xff;
}

export function setPackedLevel(level: number, lscale: number, rscale: number): number {
  return (level & 0xff) | ((rscale & 0xff) << 16) | ((lscale & 0xff) << 24);
}

export function cloneEditableCard(card: CardDataEntry): CardDataEntry {
  // Return a plain object so Svelte can deeply proxy/bind fields reactively.
  const clone = {
    ...card,
    setcode: Array.isArray(card.setcode) ? [...card.setcode] : card.setcode,
    strings: Array.isArray(card.strings) ? [...card.strings] : [],
  } as CardDataEntry;

  while (clone.strings.length < 16) clone.strings.push('');
  if (clone.strings.length > 16) clone.strings = clone.strings.slice(0, 16);

  return clone;
}
