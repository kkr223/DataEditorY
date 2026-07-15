import type { CardDataEntry } from '$lib/types';
import { LINK_MARKER_NAME_TO_BIT, SUBTYPE_MAP, TYPE_MAP } from '$lib/domain/card/taxonomy';

export type CardShowcaseItem = {
  card: CardDataEntry;
  imageSrc: string;
  infoLines: string[];
};

const CANVAS_WIDTH = 1200;
const ROW_HEIGHT = 360;
const CARD_WIDTH = 210;
const CARD_HEIGHT = 304;

const MONSTER_SUBTYPE_KEYS: Array<[string, number]> = [
  ['fusion', SUBTYPE_MAP.fusion],
  ['synchro', SUBTYPE_MAP.synchro],
  ['link', SUBTYPE_MAP.link],
  ['xyz', SUBTYPE_MAP.xyz],
  ['ritual', SUBTYPE_MAP.ritual],
  ['spssummon', SUBTYPE_MAP.spssummon],
  ['pendulum', SUBTYPE_MAP.pendulum],
  ['spirit', SUBTYPE_MAP.spirit],
  ['gemini', SUBTYPE_MAP.gemini],
  ['union', SUBTYPE_MAP.union],
  ['flip', SUBTYPE_MAP.flip],
  ['toon', SUBTYPE_MAP.toon],
  ['tuner', SUBTYPE_MAP.tuner],
];

const SPELL_SUBTYPE_KEYS: Array<[string, number]> = [
  ['quickplay', SUBTYPE_MAP.quickplay],
  ['continuous', SUBTYPE_MAP.continuous_spell],
  ['equip', SUBTYPE_MAP.equip],
  ['field', SUBTYPE_MAP.field],
  ['ritual', SUBTYPE_MAP.ritual_spell],
];

const TRAP_SUBTYPE_KEYS: Array<[string, number]> = [
  ['continuous', SUBTYPE_MAP.continuous_trap],
  ['counter', SUBTYPE_MAP.counter],
];

const CLOCKWISE_LINK_MARKERS: Array<[number, string]> = [
  [LINK_MARKER_NAME_TO_BIT.up, '↑'],
  [LINK_MARKER_NAME_TO_BIT.upright, '↗'],
  [LINK_MARKER_NAME_TO_BIT.right, '→'],
  [LINK_MARKER_NAME_TO_BIT.downright, '↘'],
  [LINK_MARKER_NAME_TO_BIT.down, '↓'],
  [LINK_MARKER_NAME_TO_BIT.downleft, '↙'],
  [LINK_MARKER_NAME_TO_BIT.left, '←'],
  [LINK_MARKER_NAME_TO_BIT.upleft, '↖'],
];

export function getShowcaseTypeKeys(type: number) {
  if (type & TYPE_MAP.monster) {
    const subtypes = MONSTER_SUBTYPE_KEYS
      .filter(([, bit]) => type & bit)
      .map(([key]) => `editor.subtype.${key}`);
    return [
      'editor.subtype.monster',
      ...subtypes,
      `editor.subtype.${type & SUBTYPE_MAP.effect ? 'effect' : 'normal'}`,
    ];
  }
  if (type & TYPE_MAP.spell) {
    return ['editor.subtype.spell', ...SPELL_SUBTYPE_KEYS
      .filter(([, bit]) => type & bit)
      .map(([key]) => `editor.subtype.${key}`)];
  }
  if (type & TYPE_MAP.trap) {
    return ['editor.subtype.trap', ...TRAP_SUBTYPE_KEYS
      .filter(([, bit]) => type & bit)
      .map(([key]) => `editor.subtype.${key}`)];
  }
  return ['search.na'];
}

export function getShowcaseLinkMarkers(linkMarker: number) {
  return CLOCKWISE_LINK_MARKERS.filter(([bit]) => linkMarker & bit).map(([, label]) => label).join('');
}

export function getShowcaseLinkCount(linkMarker: number) {
  return CLOCKWISE_LINK_MARKERS.filter(([bit]) => linkMarker & bit).length;
}

export function stripCardAttribution(description: string, customMarker = '') {
  const normalized = description.replace(/\r\n?/g, '\n');
  const marker = customMarker.trim();
  const cutAt = marker
    ? normalized.indexOf(marker)
    : normalized.search(/\n[ \t]*\n/);
  return cutAt >= 0 ? normalized.slice(0, cutAt).trimEnd() : normalized;
}

export function chunkShowcaseCards<T>(cards: T[], requestedLimit: number) {
  const limit = Math.min(30, Math.max(1, Math.floor(Number(requestedLimit) || 10)));
  const pages: T[][] = [];
  for (let index = 0; index < cards.length; index += limit) {
    pages.push(cards.slice(index, index + limit));
  }
  return pages;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function fitLine(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = '';
  for (const character of Array.from(text)) {
    if (context.measureText(`${fitted}${character}…`).width > maxWidth) break;
    fitted += character;
  }
  return `${fitted.trimEnd()}…`;
}

export function getShowcaseWrapUnits(paragraph: string) {
  if (/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(paragraph)) {
    return Array.from(paragraph);
  }
  return paragraph.includes(' ')
    ? paragraph.split(/(\s+)/).filter(Boolean)
    : Array.from(paragraph);
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    const units = getShowcaseWrapUnits(paragraph);
    let line = '';
    for (const unit of units) {
      const candidate = `${line}${unit}`;
      if (!line || context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      lines.push(line.trimEnd());
      line = unit.trimStart();
    }
    if (line) lines.push(line.trimEnd());
  }
  return lines;
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to render showcase image'));
    }, 'image/png');
  });
}

export async function renderCardShowcasePage(
  items: CardShowcaseItem[],
  options: { removeAttribution: boolean; customAttributionMarker?: string; headText?: string },
) {
  if (items.length === 0) throw new Error('No cards to render');

  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  if (!measureContext) throw new Error('Canvas context unavailable');
  const contentX = 276;
  const contentWidth = CANVAS_WIDTH - contentX - 34;
  const headText = options.headText?.trim() ?? '';
  measureContext.font = '600 20px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const headLines = headText ? wrapText(measureContext, headText, CANVAS_WIDTH - 68) : [];
  const headHeight = headLines.length ? 28 + headLines.length * 29 + 14 : 0;
  measureContext.font = '400 20px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  const rows = items.map((item) => {
    const description = options.removeAttribution
      ? stripCardAttribution(item.card.desc, options.customAttributionMarker)
      : item.card.desc;
    const effectLines = wrapText(measureContext, description, contentWidth);
    return {
      item,
      effectLines,
      height: Math.max(ROW_HEIGHT, 221 + Math.max(1, effectLines.length) * 29),
    };
  });

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = headHeight + rows.reduce((height, row) => height + row.height, 0);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas context unavailable');

  const images = await Promise.all(items.map((item) => loadImage(item.imageSrc)));
  context.textBaseline = 'top';
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  if (headHeight) {
    context.fillStyle = '#0b1220';
    context.fillRect(0, 0, CANVAS_WIDTH, headHeight);
    context.fillStyle = '#f6f0df';
    context.font = '600 20px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    headLines.forEach((line, index) => context.fillText(line, 34, 28 + index * 29));
    context.fillStyle = '#d4a84f';
    context.fillRect(0, headHeight - 2, CANVAS_WIDTH, 2);
  }

  let top = headHeight;
  rows.forEach(({ item, effectLines, height }, index) => {
    context.fillStyle = index % 2 === 0 ? '#101827' : '#152033';
    context.fillRect(0, top, CANVAS_WIDTH, height);
    context.fillStyle = '#d4a84f';
    context.fillRect(0, top, 8, height);

    const imageX = 30;
    const imageY = top + 28;
    context.fillStyle = '#263449';
    context.fillRect(imageX, imageY, CARD_WIDTH, CARD_HEIGHT);
    const image = images[index];
    if (image) {
      drawContainedImage(context, image, imageX, imageY, CARD_WIDTH, CARD_HEIGHT);
    } else {
      context.fillStyle = '#8290a6';
      context.font = '600 18px "Microsoft YaHei", sans-serif';
      context.textAlign = 'center';
      context.fillText(String(item.card.code), imageX + CARD_WIDTH / 2, imageY + CARD_HEIGHT / 2 - 10);
      context.textAlign = 'left';
    }

    context.fillStyle = '#f6f0df';
    context.font = '700 30px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    context.fillText(fitLine(context, item.card.name || String(item.card.code), contentWidth - 170), contentX, top + 30);

    context.fillStyle = '#d4a84f';
    context.font = '600 17px Consolas, monospace';
    context.textAlign = 'right';
    context.fillText(String(item.card.code), CANVAS_WIDTH - 34, top + 39);
    context.textAlign = 'left';

    context.fillStyle = '#aebbd0';
    context.font = '500 18px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    item.infoLines.slice(0, 2).forEach((line, lineIndex) => {
      context.fillText(fitLine(context, line, contentWidth), contentX, top + 79 + lineIndex * 28);
    });

    context.fillStyle = '#d4a84f';
    context.fillRect(contentX, top + 142, contentWidth, 2);

    context.fillStyle = '#e2e8f0';
    context.font = '400 20px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    effectLines.forEach((line, lineIndex) => {
      context.fillText(line, contentX, top + 164 + lineIndex * 29);
    });

    context.fillStyle = '#2d3a4e';
    context.fillRect(28, top + height - 1, CANVAS_WIDTH - 56, 1);
    top += height;
  });

  return canvasToPng(canvas);
}
