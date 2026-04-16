import {
  ATTRIBUTE_OPTIONS,
  getCardTypeKey,
  getPackedLScale,
  getPackedLevel,
  getPackedRScale,
  LINK_MARKERS,
  RACE_OPTIONS,
  TYPE_BITS,
} from '$lib/utils/card';
import type { CardDataEntry } from '$lib/types';
import type { ScriptImageRenderInfo } from '$lib/features/script-editor/useCases';

type Translate = (key: string) => string;

export function getScriptCardMetaLines(card: CardDataEntry | null, fallbackCode: number, t: Translate) {
  if (!card) {
    return [`ID: ${fallbackCode}`];
  }

  const typeText = TYPE_BITS
    .filter((item) => (card.type & item.bit) !== 0)
    .map((item) => t(item.key))
    .join(' / ') || t('search.na');
  const attributeText = ATTRIBUTE_OPTIONS.find((item) => item.value === card.attribute)?.key
    ? t(ATTRIBUTE_OPTIONS.find((item) => item.value === card.attribute)?.key as string)
    : t('search.na');
  const raceText = RACE_OPTIONS.find((item) => item.value === card.race)?.key
    ? t(RACE_OPTIONS.find((item) => item.value === card.race)?.key as string)
    : t('search.na');
  const mainType = t(getCardTypeKey(card.type));
  const levelValue = getPackedLevel(card.level);
  const leftScale = getPackedLScale(card.level);
  const rightScale = getPackedRScale(card.level);
  const isLink = (card.type & 0x4000000) !== 0;
  const isPendulum = leftScale > 0 || rightScale > 0;
  const statsLine = isLink
    ? `ATK ${card.attack}  LINK ${levelValue || 0}`
    : `ATK ${card.attack}  DEF ${card.defense}  ${mainType === t('search.types.monster') ? `LV ${levelValue || 0}` : mainType}`;
  const extras = [];
  if (isPendulum) {
    extras.push(`Scale ${leftScale}/${rightScale}`);
  }
  if (isLink) {
    const markers = LINK_MARKERS.filter((item) => (card.linkMarker & item.bit) !== 0).map((item) => item.label).join(' ');
    if (markers) {
      extras.push(`Link ${markers}`);
    }
  }

  return [
    `ID: ${card.code}`,
    `Type: ${typeText}`,
    `Attribute / Race: ${attributeText} / ${raceText}`,
    extras.length > 0 ? `${statsLine}  ${extras.join('  ')}` : statsLine,
  ];
}

export function buildScriptImageRenderInfo(input: {
  cardContext: CardDataEntry | null;
  fallbackCode: number;
  title: string;
  t: Translate;
}): ScriptImageRenderInfo {
  return {
    title: input.cardContext?.name?.trim() || input.title,
    metaLines: getScriptCardMetaLines(input.cardContext, input.fallbackCode, input.t),
    effectTitle: input.t('editor.desc'),
    effectText: input.cardContext?.desc?.trim() || input.t('editor.script_effect_empty'),
  };
}
