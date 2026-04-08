import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import { SnippetController2 } from 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { luaCatalog as defaultLuaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { analyzeLuaScript, ensureLuaDiagnosticsCatalogLoaded } from '$lib/utils/luaScriptDiagnostics';
import { getCompletionInsertParameters, shouldInsertFunctionReferenceOnly } from '$lib/utils/luaFunctionCompletion';
import { loadExternalLuaCatalog } from '$lib/utils/luaIntelCatalog';
import {
  collectLuaInlineHighlights,
  type LuaInlineHighlightClassName,
} from '$lib/utils/luaScriptCalls';
import {
  getCallInfoAt,
  getFunctionSymbols,
  getHoverInfoAt,
  getLuaSemanticDocument,
  getVisibleSymbolsAt,
  type LuaScriptFunctionSymbol,
  type LuaSemanticTextModel,
  type LuaVisibleSymbol,
} from '$lib/utils/luaSemantic';
import type { CardDataEntry, LuaConstantItem, LuaFunctionItem } from '$lib/types';

type LuaModelContext = {
  cardCode: number;
  cardName: string;
  strings: string[];
  card: CardDataEntry | null;
};

type LuaStaticType = string;
type LuaScope = Map<string, LuaStaticType>;
type LuaNode = {
  type?: string;
  loc?: {
    start?: { line: number; column: number };
    end?: { line: number; column: number };
  };
  [key: string]: unknown;
};

export type LuaReferenceManualKind = 'constants' | 'functions';
export type LuaReferenceManualItem = {
  key: string;
  title: string;
  detail: string;
  description: string;
  category: string;
  valueText: string;
  insertText: string;
  insertAsSnippet: boolean;
  searchText: string;
};

const LUA_MARKER_OWNER = 'dataeditory-lua';
const modelContexts = new Map<string, LuaModelContext>();
const METHOD_NAMESPACES = new Set(['Card', 'Effect', 'Group']);
const GLOBAL_NAMESPACES = new Set(['Card', 'Effect', 'Group', 'Duel', 'Debug']);
const COMMON_PARAM_TYPE_MAP: Record<string, LuaStaticType> = {
  c: 'Card',
  chkc: 'Card',
  tc: 'Card',
  sc: 'Card',
  fc: 'Card',
  rc: 'Card',
  mc: 'Card',
  xc: 'Card',
  dc: 'Card',
  pc: 'Card',
  gc: 'Card',
  bc: 'Card',
  cc: 'Card',
  ac: 'Card',
  e: 'Effect',
  re: 'Effect',
  te: 'Effect',
  ce: 'Effect',
  g: 'Group',
  eg: 'Group',
  sg: 'Group',
  mg: 'Group',
  pg: 'Group',
  dg: 'Group',
  rg: 'Group',
  fg: 'Group',
  og: 'Group',
  vg: 'Group',
};
let luaCatalog = defaultLuaCatalog;
let functionsByName = new Map<string, LuaFunctionItem>();
let functionsByNamespace = new Map<string, LuaFunctionItem[]>();
let functionsByShortName = new Map<string, LuaFunctionItem[]>();
let constantDescriptionsByName = new Map<string, string>();

let providersRegistered = false;
let catalogLoadPromise: Promise<void> | null = null;

function rebuildCatalogIndexes() {
  functionsByName = new Map(luaCatalog.functions.map((item) => [item.name, item]));
  functionsByNamespace = new Map<string, LuaFunctionItem[]>();
  functionsByShortName = new Map<string, LuaFunctionItem[]>();
  constantDescriptionsByName = new Map(luaCatalog.constants.map((item) => [item.name, item.description || item.value]));

  for (const item of luaCatalog.functions) {
    const namespaceItems = functionsByNamespace.get(item.namespace) ?? [];
    namespaceItems.push(item);
    functionsByNamespace.set(item.namespace, namespaceItems);

    const shortNameItems = functionsByShortName.get(item.shortName) ?? [];
    shortNameItems.push(item);
    functionsByShortName.set(item.shortName, shortNameItems);
  }
}

async function ensureLuaCatalogLoaded() {
  if (!catalogLoadPromise) {
    catalogLoadPromise = (async () => {
      const externalCatalog = await loadExternalLuaCatalog();
      if (externalCatalog) {
        luaCatalog = externalCatalog;
      }
      rebuildCatalogIndexes();
    })();
  }

  await catalogLoadPromise;
}

rebuildCatalogIndexes();

declare global {
  interface Window {
    MonacoEnvironment?: {
      getWorker?: (workerId: string, label: string) => Worker;
    };
  }
}

function ensureMonacoEnvironment() {
  if (typeof window === 'undefined') return;
  if (window.MonacoEnvironment?.getWorker) return;

  window.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

function getCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type LuaEditorThemeSpec = {
  base: 'vs' | 'vs-dark';
  inherit: boolean;
  rules: Array<{ token: string; foreground: string; fontStyle?: string }>;
  colors: Record<string, string>;
};

type LuaImageTheme = {
  background: string;
  foreground: string;
  lineNumber: string;
  guideLine: string;
  panelBackground: string;
  panelBorder: string;
  muted: string;
  inlineHighlightColors: Record<LuaInlineHighlightClassName, string>;
};

export type LuaCodeImageRenderOptions = {
  title?: string;
  metaLines?: string[];
  effectTitle?: string;
  effectText?: string;
  lineNumberStart?: number;
};

type LuaCodeImageSegment = {
  text: string;
  color: string;
  fontStyle: string;
  fontWeight: string;
};

type LuaCodeImageHighlightRange = {
  startColumn: number;
  endColumn: number;
  className: LuaInlineHighlightClassName;
};

function getLuaEditorThemeSpecs() {
  return {
    dark: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '7f8ea3' },
        { token: 'keyword', foreground: 'd7a95b', fontStyle: 'bold' },
        { token: 'string', foreground: '86efac' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'delimiter', foreground: 'cbd5e1' },
        { token: 'identifier', foreground: 'f8fafc' },
      ],
      colors: {
        'editor.background': '#121714',
        'editor.foreground': getCssVar('--text-primary') || '#f5f8ff',
        'editor.lineHighlightBackground': 'rgba(118, 184, 151, 0.12)',
        'editorLineNumber.foreground': '#71877f',
        'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#f5f8ff',
        'editorCursor.foreground': getCssVar('--accent-primary') || '#3b82f6',
        'editor.selectionBackground': 'rgba(87, 166, 121, 0.28)',
        'editor.inactiveSelectionBackground': 'rgba(87, 166, 121, 0.18)',
        'editorWidget.background': '#26312d',
        'editorWidget.border': '#4d6159',
        'editorSuggestWidget.background': '#26312d',
        'editorSuggestWidget.border': '#4d6159',
        'editorSuggestWidget.selectedBackground': 'rgba(82, 122, 98, 0.46)',
        'editorSuggestWidget.selectedForeground': '#f2fbf5',
        'editorSuggestWidget.highlightForeground': '#b8f2c4',
        'list.activeSelectionBackground': '#50675b',
        'list.activeSelectionForeground': '#f2fbf5',
        'list.inactiveSelectionBackground': 'rgba(80, 103, 91, 0.5)',
        'list.hoverBackground': 'rgba(80, 103, 91, 0.24)',
        'list.highlightForeground': '#b8f2c4',
        'editorHoverWidget.background': '#26312d',
        'editorHoverWidget.border': '#4d6159',
        'editorError.foreground': '#d89a96',
        'editorError.border': '#00000000',
        'editorError.background': 'rgba(216, 154, 150, 0.12)',
        'editorWarning.foreground': '#d3bf8a',
        'editorWarning.border': '#00000000',
        'editorWarning.background': 'rgba(211, 191, 138, 0.1)',
        'editorInfo.foreground': '#89b8c9',
        'editorInfo.border': '#00000000',
        'editorInfo.background': 'rgba(137, 184, 201, 0.08)',
      },
    },
    light: {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b' },
        { token: 'keyword', foreground: '8a4b00', fontStyle: 'bold' },
        { token: 'string', foreground: '15803d' },
        { token: 'number', foreground: 'b45309' },
        { token: 'delimiter', foreground: '1f2937' },
        { token: 'identifier', foreground: '111827' },
      ],
      colors: {
        'editor.background': '#f1f5ec',
        'editor.foreground': getCssVar('--text-primary') || '#152033',
        'editor.lineHighlightBackground': 'rgba(74, 133, 91, 0.1)',
        'editorLineNumber.foreground': '#7f9683',
        'editorLineNumber.activeForeground': getCssVar('--text-primary') || '#152033',
        'editorCursor.foreground': getCssVar('--accent-primary') || '#2563eb',
        'editor.selectionBackground': 'rgba(79, 142, 98, 0.22)',
        'editor.inactiveSelectionBackground': 'rgba(79, 142, 98, 0.14)',
        'editorWidget.background': '#ffffff',
        'editorWidget.border': '#b5c7b7',
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.border': '#b5c7b7',
        'editorSuggestWidget.selectedBackground': 'rgba(97, 141, 106, 0.16)',
        'editorSuggestWidget.selectedForeground': '#16311e',
        'editorSuggestWidget.highlightForeground': '#215d2f',
        'list.activeSelectionBackground': '#dbe8dc',
        'list.activeSelectionForeground': '#16311e',
        'list.inactiveSelectionBackground': 'rgba(219, 232, 220, 0.72)',
        'list.hoverBackground': 'rgba(219, 232, 220, 0.42)',
        'list.highlightForeground': '#215d2f',
        'editorHoverWidget.background': '#ffffff',
        'editorHoverWidget.border': '#b5c7b7',
        'editorError.foreground': '#c8746b',
        'editorError.border': '#00000000',
        'editorError.background': 'rgba(200, 116, 107, 0.1)',
        'editorWarning.foreground': '#b08a39',
        'editorWarning.border': '#00000000',
        'editorWarning.background': 'rgba(176, 138, 57, 0.08)',
        'editorInfo.foreground': '#4d87a0',
        'editorInfo.border': '#00000000',
        'editorInfo.background': 'rgba(77, 135, 160, 0.06)',
      },
    },
  } satisfies Record<'dark' | 'light', LuaEditorThemeSpec>;
}

function defineThemes() {
  const specs = getLuaEditorThemeSpecs();
  monaco.editor.defineTheme('dataeditory-dark', specs.dark);
  monaco.editor.defineTheme('dataeditory-light', specs.light);
}

function getCurrentLuaImageTheme(): LuaImageTheme {
  const specs = getLuaEditorThemeSpecs();
  const theme = document.documentElement.getAttribute('data-theme') === 'light'
    ? specs.light
    : specs.dark;

  return {
    background: theme.colors['editor.background'],
    foreground: theme.colors['editor.foreground'],
    lineNumber: theme.colors['editorLineNumber.foreground'],
    guideLine: theme.colors['editor.lineHighlightBackground'],
    panelBackground: theme.base === 'vs' ? '#ffffff' : '#1a221f',
    panelBorder: theme.base === 'vs' ? '#b5c7b7' : '#4d6159',
    muted: theme.colors['editorLineNumber.foreground'],
    inlineHighlightColors: theme.base === 'vs'
      ? {
          'lua-call-highlight': '#1d5fd1',
          'lua-call-arg-highlight': '#7c3aed',
          'lua-parameter-highlight': '#8b5cf6',
          'lua-constant-highlight': '#0f766e',
        }
      : {
          'lua-call-highlight': '#8ec5ff',
          'lua-call-arg-highlight': '#c792ff',
          'lua-parameter-highlight': '#d8b4fe',
          'lua-constant-highlight': '#5eead4',
        },
  };
}

function getCurrentLuaThemeName() {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'dataeditory-light'
    : 'dataeditory-dark';
}

function getCurrentLuaThemeBaseClass(themeName: string) {
  return themeName === 'dataeditory-light' ? 'vs' : 'vs-dark';
}

function buildCanvasFont(fontSize: number, fontFamily: string, segment?: Partial<LuaCodeImageSegment>) {
  const style = segment?.fontStyle && segment.fontStyle !== 'normal' ? segment.fontStyle : '';
  const weight = segment?.fontWeight && segment.fontWeight !== 'normal' ? segment.fontWeight : '';
  return [style, weight, `${fontSize}px`, fontFamily].filter(Boolean).join(' ');
}

function collectColorizedSegments(node: Node, fallbackColor: string, segments: LuaCodeImageSegment[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').replace(/\u00a0/g, ' ');
    if (!text) return;

    const parent = node.parentElement;
    const style = parent ? getComputedStyle(parent) : null;
    segments.push({
      text,
      color: style?.color || fallbackColor,
      fontStyle: style?.fontStyle || 'normal',
      fontWeight: style?.fontWeight || '400',
    });
    return;
  }

  for (const child of Array.from(node.childNodes)) {
    collectColorizedSegments(child, fallbackColor, segments);
  }
}

function createColorizedLineReader(themeName: string, fontSize: number, fontFamily: string, fallbackColor: string) {
  const host = document.createElement('div');
  host.className = `monaco-editor ${getCurrentLuaThemeBaseClass(themeName)}`;
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';

  const line = document.createElement('div');
  line.style.whiteSpace = 'pre';
  line.style.font = buildCanvasFont(fontSize, fontFamily);
  line.style.color = fallbackColor;
  host.appendChild(line);
  document.body.appendChild(host);

  return {
    read(html: string) {
      line.innerHTML = html;
      const segments: LuaCodeImageSegment[] = [];
      collectColorizedSegments(line, fallbackColor, segments);
      line.textContent = '';
      return segments;
    },
    dispose() {
      host.remove();
    },
  };
}

function measureColorizedLineWidth(
  context: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
  segments: LuaCodeImageSegment[],
) {
  let width = 0;
  for (const segment of segments) {
    context.font = buildCanvasFont(fontSize, fontFamily, segment);
    width += context.measureText(segment.text).width;
  }
  return width;
}

function sourceColumnToDisplayColumn(line: string, targetColumn: number, tabSize: number) {
  let sourceColumn = 1;
  let displayColumn = 1;

  for (const char of line) {
    if (sourceColumn >= targetColumn) {
      break;
    }

    if (char === '\t') {
      const offset = (displayColumn - 1) % tabSize;
      displayColumn += tabSize - offset;
    } else {
      displayColumn += 1;
    }

    sourceColumn += 1;
  }

  return displayColumn;
}

function applyHighlightRangesToSegments(
  segments: LuaCodeImageSegment[],
  ranges: LuaCodeImageHighlightRange[],
  theme: LuaImageTheme,
) {
  if (ranges.length === 0) {
    return segments;
  }

  const result: LuaCodeImageSegment[] = [];
  const sortedRanges = [...ranges].sort((left, right) => left.startColumn - right.startColumn);
  let rangeIndex = 0;
  let column = 1;

  for (const segment of segments) {
    const segmentStart = column;
    const segmentEnd = segmentStart + segment.text.length;
    let localStart = segmentStart;
    let offset = 0;

    while (offset < segment.text.length) {
      while (rangeIndex < sortedRanges.length && sortedRanges[rangeIndex].endColumn <= localStart) {
        rangeIndex += 1;
      }

      const activeRange = sortedRanges[rangeIndex];
      const remainingLength = segment.text.length - offset;
      if (!activeRange || activeRange.startColumn >= localStart + remainingLength) {
        result.push({
          ...segment,
          text: segment.text.slice(offset),
        });
        break;
      }

      if (activeRange.startColumn > localStart) {
        const plainLength = activeRange.startColumn - localStart;
        result.push({
          ...segment,
          text: segment.text.slice(offset, offset + plainLength),
        });
        offset += plainLength;
        localStart += plainLength;
        continue;
      }

      const highlightedLength = Math.min(activeRange.endColumn, segmentEnd) - localStart;
      result.push({
        ...segment,
        text: segment.text.slice(offset, offset + highlightedLength),
        color: theme.inlineHighlightColors[activeRange.className],
        fontWeight: '600',
      });
      offset += highlightedLength;
      localStart += highlightedLength;
    }

    column = segmentEnd;
  }

  return result.filter((segment) => segment.text.length > 0);
}

function wrapTextToLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = text.split('\n');
  const wrapped: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      wrapped.push('');
      continue;
    }

    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth || !currentLine) {
        currentLine = candidate;
        continue;
      }

      wrapped.push(currentLine);
      currentLine = word;
    }

    wrapped.push(currentLine);
  }

  return wrapped;
}

export function renderLuaCodeImage(content: string, options: LuaCodeImageRenderOptions = {}) {
  syncMonacoTheme();
  const theme = getCurrentLuaImageTheme();
  const themeName = getCurrentLuaThemeName();
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
  const fontSize = 14;
  const lineHeight = 22;
  const paddingX = 16;
  const paddingY = 12;
  const gutterGap = 14;
  const sectionGap = 12;
  const tabSize = 2;
  const fontFamily = '"Cascadia Mono", Consolas, "Courier New", monospace';
  const lineCount = Math.max(1, lines.length);
  const lineNumberStart = Math.max(1, options.lineNumberStart ?? 1);

  const measureCanvas = document.createElement('canvas');
  const measureContext = measureCanvas.getContext('2d');
  if (!measureContext) {
    throw new Error('Failed to create a canvas context');
  }
  measureContext.font = buildCanvasFont(fontSize, fontFamily);
  const bodyTextWidth = 920;
  const metaLines = options.metaLines?.filter(Boolean) ?? [];
  const effectText = options.effectText?.trim() ?? '';
  const effectTitle = options.effectTitle?.trim() ?? '';
  const title = options.title?.trim() ?? '';
  const wrappedEffectLines = effectText
    ? wrapTextToLines(measureContext, effectText, bodyTextWidth)
    : [];
  const effectTitleWidth = effectTitle ? measureContext.measureText(effectTitle).width : 0;

  const lineNumberChars = Math.max(3, String(lineCount).length);
  const gutterWidth = Math.ceil(measureContext.measureText('9'.repeat(lineNumberChars)).width) + gutterGap;
  const model = monaco.editor.createModel(normalized, 'lua');
  const lineReader = createColorizedLineReader(themeName, fontSize, fontFamily, theme.foreground);
  let colorizedLines: LuaCodeImageSegment[][] = [];
  try {
    colorizedLines = Array.from({ length: lineCount }, (_, index) =>
      lineReader.read(monaco.editor.colorizeModelLine(model, index + 1, tabSize)),
    );
  } finally {
    lineReader.dispose();
    model.dispose();
  }
  const callHighlightRangesByLine = new Map<number, LuaCodeImageHighlightRange[]>();
  for (const item of collectLuaInlineHighlights(normalized)) {
    const lineText = lines[item.startLineNumber - 1] ?? '';
    const ranges = callHighlightRangesByLine.get(item.startLineNumber) ?? [];
    ranges.push({
      startColumn: sourceColumnToDisplayColumn(lineText, item.startColumn, tabSize),
      endColumn: sourceColumnToDisplayColumn(lineText, item.endColumn, tabSize),
      className: item.className,
    });
    callHighlightRangesByLine.set(item.startLineNumber, ranges);
  }
  colorizedLines = colorizedLines.map((segments, index) =>
    applyHighlightRangesToSegments(
      segments,
      callHighlightRangesByLine.get(index + 1) ?? [],
      theme,
    ),
  );
  const maxContentWidth = colorizedLines.reduce(
    (max, segments) => Math.max(max, measureColorizedLineWidth(measureContext, fontSize, fontFamily, segments)),
    0,
  );

  const infoWidth = Math.max(
    title ? measureContext.measureText(title).width : 0,
    ...metaLines.map((line) => measureContext.measureText(line).width),
    ...wrappedEffectLines.map((line) => measureContext.measureText(line).width),
    effectTitleWidth,
  );
  const width = Math.ceil(paddingX * 2 + Math.max(gutterWidth + maxContentWidth, bodyTextWidth, infoWidth));
  const infoLineHeight = 20;
  const titleHeight = title ? 28 : 0;
  const metaHeight = metaLines.length * infoLineHeight;
  const effectHeight = (effectTitle ? infoLineHeight : 0) + wrappedEffectLines.length * infoLineHeight;
  const hasInfoPanel = Boolean(title || metaLines.length > 0 || effectTitle || effectText);
  const infoPanelHeight = hasInfoPanel
    ? paddingY * 2 + titleHeight + metaHeight + (effectHeight > 0 && metaHeight > 0 ? 8 : 0) + effectHeight
    : 0;
  const codeStartY = paddingY + (hasInfoPanel ? infoPanelHeight + sectionGap : 0);
  const height = Math.ceil(codeStartY + lineCount * lineHeight + paddingY);
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create a canvas context');
  }

  context.scale(scale, scale);
  context.fillStyle = theme.background;
  context.fillRect(0, 0, width, height);
  context.textBaseline = 'middle';

  if (hasInfoPanel) {
    context.fillStyle = theme.panelBackground;
    context.strokeStyle = theme.panelBorder;
    context.lineWidth = 1;
    context.beginPath();
    context.roundRect(paddingX, paddingY, width - paddingX * 2, infoPanelHeight, 12);
    context.fill();
    context.stroke();

    let infoY = paddingY + 18;
    context.textAlign = 'left';
    if (title) {
      context.font = `bold 18px ${fontFamily}`;
      context.fillStyle = theme.foreground;
      context.fillText(title, paddingX + 14, infoY);
      infoY += titleHeight;
    }

    context.font = `${fontSize}px ${fontFamily}`;
    for (const line of metaLines) {
      context.fillStyle = theme.muted;
      context.fillText(line, paddingX + 14, infoY);
      infoY += infoLineHeight;
    }

    if (effectHeight > 0 && metaHeight > 0) {
      infoY += 8;
    }

    if (effectTitle) {
      context.font = `bold ${fontSize}px ${fontFamily}`;
      context.fillStyle = theme.foreground;
      context.fillText(effectTitle, paddingX + 14, infoY);
      infoY += infoLineHeight;
    }

    context.font = `${fontSize}px ${fontFamily}`;
    for (const line of wrappedEffectLines) {
      context.fillStyle = theme.foreground;
      context.fillText(line, paddingX + 14, infoY);
      infoY += infoLineHeight;
    }
  }

  for (let index = 0; index < lineCount; index += 1) {
    const top = codeStartY + index * lineHeight;
    context.fillStyle = theme.guideLine;
    context.fillRect(0, top + lineHeight - 1, width, 1);
  }

  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const y = codeStartY + lineIndex * lineHeight + lineHeight / 2;

    context.font = buildCanvasFont(fontSize, fontFamily);
    context.fillStyle = theme.lineNumber;
    context.textAlign = 'right';
    context.fillText(String(lineNumberStart + lineIndex), paddingX + gutterWidth - 8, y);

    let x = paddingX + gutterWidth;
    context.textAlign = 'left';
    const segments = colorizedLines[lineIndex] ?? [];

    for (const segment of segments) {
      context.font = buildCanvasFont(fontSize, fontFamily, segment);
      context.fillStyle = segment.color;
      context.fillText(segment.text, x, y);
      x += context.measureText(segment.text).width;
    }
  }

  return canvas;
}

export async function renderLuaCodeImageBlob(content: string, options: LuaCodeImageRenderOptions = {}) {
  const canvas = renderLuaCodeImage(content, options);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Failed to render the script image'));
    }, 'image/png');
  });
}

export function syncMonacoTheme() {
  defineThemes();
  monaco.editor.setTheme(getCurrentLuaThemeName());
}

function toMarkdownParagraphs(lines: string[]) {
  return lines.filter(Boolean).join('\n\n');
}

function toSignatureLabel(item: LuaFunctionItem) {
  return `${item.returnType} ${item.signature}`;
}

function getParameterHints(item: LuaFunctionItem) {
  return item.parameters.length > 0 ? item.parameters : [''];
}

function stripParameterName(parameter: string) {
  return parameter
    .replace(/[\[\]]/g, '')
    .split('=')
    .at(0)
    ?.trim()
    .split(/\s+/)
    .at(-1)
    ?.replace(/\W+/g, '') || 'arg';
}

function escapeSnippetPlaceholder(value: string) {
  return value.replace(/[$}\\]/g, '\\$&');
}

function buildFunctionInsertText(
  displayName: string,
  item: LuaFunctionItem,
  options: {
    omitFirstParameter?: boolean;
  } = {},
) {
  const parameters = getCompletionInsertParameters(
    getInvocationParameters(item, Boolean(options.omitFirstParameter)),
  );

  if (parameters.length === 0 || (parameters.length === 1 && parameters[0] === '')) {
    return `${displayName}()`;
  }

  const placeholder = parameters
    .map((parameter, index) => `\${${index + 1}:${escapeSnippetPlaceholder(stripParameterName(parameter))}}`)
    .join(',');
  return `${displayName}(${placeholder})`;
}

function getFullTokenAtPosition(model: monaco.editor.ITextModel, position: monaco.Position) {
  const line = model.getLineContent(position.lineNumber);
  let start = position.column - 1;
  let end = position.column - 1;

  while (start > 0 && /[\w.]/.test(line[start - 1] ?? '')) {
    start -= 1;
  }
  while (end < line.length && /[\w.]/.test(line[end] ?? '')) {
    end += 1;
  }

  return {
    text: line.slice(start, end),
    startColumn: start + 1,
    endColumn: end + 1,
  };
}

function getPrimaryReturnType(item: LuaFunctionItem) {
  const primary = item.returnType
    .split(/[|,\[]/, 1)[0]
    ?.trim();
  return primary || null;
}

function normalizeStaticType(typeName: string | null | undefined): LuaStaticType | null {
  if (!typeName) return null;

  const candidate = typeName
    .split('|')
    .map((item) => item.trim())
    .find((item) => item && item !== 'nil' && item !== 'any' && item !== 'unknown');

  if (!candidate) return null;

  const normalized = candidate.replace(/[\[\]?]/g, '').trim();
  return normalized || null;
}

function getParameterTokens(parameter: string) {
  return parameter
    .replace(/[\[\]]/g, '')
    .split('=')
    .at(0)
    ?.trim()
    .split(/\s+/)
    .filter(Boolean) ?? [];
}

function getParameterNameToken(parameter: string) {
  const tokens = getParameterTokens(parameter);
  return tokens.at(-1)?.replace(/\?$/, '') ?? '';
}

function getParameterTypeToken(parameter: string) {
  const tokens = getParameterTokens(parameter);
  if (tokens.length <= 1) return '';
  return tokens.slice(0, -1).join(' ').trim();
}

function isMethodReceiverParameter(item: LuaFunctionItem, parameter: string) {
  const normalizedType = normalizeStaticType(getParameterTypeToken(parameter));
  if (normalizedType === item.namespace) {
    return true;
  }

  const name = getParameterNameToken(parameter);
  if (name === 'self') {
    return true;
  }

  if (item.namespace === 'Card' && name === 'c') return true;
  if (item.namespace === 'Effect' && name === 'e') return true;
  if (item.namespace === 'Group' && name === 'g') return true;
  return false;
}

function getInvocationParameters(item: LuaFunctionItem, usesMethodSyntax: boolean) {
  if (!usesMethodSyntax || item.parameters.length === 0) {
    return item.parameters.slice();
  }

  const [firstParameter, ...restParameters] = item.parameters;
  return isMethodReceiverParameter(item, firstParameter) ? restParameters : item.parameters.slice();
}

function splitOptionalParameterBlock(parameterBlock: string) {
  return parameterBlock
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isOptionalParameter(parameter: string) {
  const trimmed = parameter.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return true;
  }

  const nameToken = getParameterNameToken(trimmed);
  return trimmed.includes('|nil') || nameToken.endsWith('?') || /\w+\?$/.test(trimmed);
}

function isKnownNamespace(typeName: LuaStaticType | null | undefined): typeName is LuaStaticType {
  return Boolean(typeName && functionsByNamespace.has(typeName));
}

function getFunctionFromNamespace(namespace: string, memberName: string) {
  return functionsByName.get(`${namespace}.${memberName}`) ?? null;
}

function getFunctionCallInfo(node: LuaNode, scopes: LuaScope[], model?: monaco.editor.ITextModel) {
  if (node.type !== 'CallExpression') return null;

  const base = node.base as LuaNode | undefined;
  if (!base || base.type !== 'MemberExpression') return null;

  const memberIdentifier = base.identifier as LuaNode | undefined;
  const memberName = typeof memberIdentifier?.name === 'string' ? memberIdentifier.name : '';
  if (!memberName) return null;

  const receiver = base.base as LuaNode | undefined;
  let namespace: LuaStaticType | null = inferExpressionType(receiver, scopes, model);

  if (!namespace && receiver?.type === 'Identifier' && model) {
    namespace = inferReceiverNamespace(model, String(receiver.name ?? ''), receiver.loc?.start?.line ?? 1);
  }

  if (!namespace && receiver?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(receiver.name ?? ''))) {
    namespace = String(receiver.name);
  }

  if (!namespace || !isKnownNamespace(namespace)) return null;

  return {
    namespace,
    memberName,
    indexer: base.indexer === ':' ? ':' : '.',
    memberNode: memberIdentifier,
    receiverNode: receiver,
    item: getFunctionFromNamespace(namespace, memberName),
    callNode: node,
  };
}

function inferExpressionType(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  model?: monaco.editor.ITextModel,
): LuaStaticType | null {
  if (!node) return null;

  if (node.type === 'Identifier') {
    const name = String(node.name ?? '');
    for (let index = scopes.length - 1; index >= 0; index -= 1) {
      const scoped = scopes[index].get(name);
      if (scoped) return scoped;
    }
    if (GLOBAL_NAMESPACES.has(name)) {
      return name;
    }
    return null;
  }

  if (node.type === 'CallExpression') {
    const callInfo = getFunctionCallInfo(node, scopes, model);
    if (!callInfo?.item) return null;
    return normalizeStaticType(getPrimaryReturnType(callInfo.item));
  }

  if (node.type === 'MemberExpression') {
    const baseNode = node.base as LuaNode | undefined;
    if (baseNode?.type === 'Identifier' && GLOBAL_NAMESPACES.has(String(baseNode.name ?? ''))) {
      return String(baseNode.name);
    }
  }

  return null;
}

function getMarkerRange(node: LuaNode | undefined, model: monaco.editor.ITextModel) {
  const startLineNumber = node?.loc?.start?.line ?? 1;
  const startColumn = (node?.loc?.start?.column ?? 0) + 1;
  const endLineNumber = node?.loc?.end?.line ?? startLineNumber;
  const endColumn = (node?.loc?.end?.column ?? startColumn) + (node?.loc?.end ? 1 : 1);

  return {
    startLineNumber,
    startColumn,
    endLineNumber,
    endColumn: Math.max(startColumn + 1, Math.min(endColumn, model.getLineMaxColumn(endLineNumber))),
  };
}

function pushStaticWarning(markers: monaco.editor.IMarkerData[], model: monaco.editor.ITextModel, node: LuaNode | undefined, message: string) {
  markers.push({
    severity: monaco.MarkerSeverity.Warning,
    message,
    ...getMarkerRange(node, model),
  });
}

function inferFunctionParameterType(functionNode: LuaNode, parameterName: string, index: number): LuaStaticType | null {
  if (parameterName in COMMON_PARAM_TYPE_MAP) {
    return COMMON_PARAM_TYPE_MAP[parameterName] ?? null;
  }

  const identifier = functionNode.identifier as LuaNode | undefined;
  if (identifier?.type === 'MemberExpression') {
    const functionName = String((identifier.identifier as LuaNode | undefined)?.name ?? '');
    if (functionName === 'initial_effect' && index === 0 && parameterName === 'c') {
      return 'Card';
    }
  }

  return null;
}

function getArityExpectation(item: LuaFunctionItem, usesMethodSyntax: boolean) {
  const parameters = getInvocationParameters(item, usesMethodSyntax);
  let maxArgs = 0;
  let minArgs = 0;
  let hasVariadic = false;

  for (const parameter of parameters) {
    const trimmed = parameter.trim();
    if (!trimmed) continue;

    const optionalStart = trimmed.indexOf('[');
    if (optionalStart >= 0 && trimmed.includes(']')) {
      const requiredHead = trimmed.slice(0, optionalStart).trim().replace(/,+$/, '').trim();
      if (requiredHead) {
        minArgs += 1;
        maxArgs += 1;
      }

      const optionalTail = trimmed.slice(optionalStart + 1, trimmed.lastIndexOf(']'));
      for (const optionalParameter of splitOptionalParameterBlock(optionalTail)) {
        if (optionalParameter.includes('...')) {
          hasVariadic = true;
          continue;
        }
        maxArgs += 1;
      }
      continue;
    }

    if (trimmed.includes('...')) {
      hasVariadic = true;
      continue;
    }

    maxArgs += 1;
    if (!isOptionalParameter(trimmed)) {
      minArgs += 1;
    }
  }

  return {
    minArgs,
    maxArgs: hasVariadic ? null : maxArgs,
  };
}

function validateCallExpression(
  node: LuaNode,
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  const callInfo = getFunctionCallInfo(node, scopes, model);
  if (!callInfo) return;

  if (!callInfo.item) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.namespace}.${callInfo.memberName} is not a known API member.`,
    );
    return;
  }

  const argumentCount = Array.isArray(node.arguments) ? node.arguments.length : 0;
  const arity = getArityExpectation(callInfo.item, callInfo.indexer === ':');

  if (arity.minArgs !== null && argumentCount < arity.minArgs) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.item.name} expects ${arity.minArgs} argument(s), got ${argumentCount}.`,
    );
    return;
  }

  if (arity.maxArgs !== null && argumentCount > arity.maxArgs) {
    pushStaticWarning(
      markers,
      model,
      callInfo.memberNode,
      `${callInfo.item.name} expects at most ${arity.maxArgs} argument(s), got ${argumentCount}.`,
    );
  }
}

function walkExpression(
  node: LuaNode | undefined,
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  if (!node) return;

  if (node.type === 'CallExpression') {
    validateCallExpression(node, scopes, model, markers);
    walkExpression(node.base as LuaNode | undefined, scopes, model, markers);
    for (const argument of (node.arguments as LuaNode[] | undefined) ?? []) {
      walkExpression(argument, scopes, model, markers);
    }
    return;
  }

  if (node.type === 'MemberExpression') {
    walkExpression(node.base as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
    walkExpression(node.left as LuaNode | undefined, scopes, model, markers);
    walkExpression(node.right as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'UnaryExpression') {
    walkExpression(node.argument as LuaNode | undefined, scopes, model, markers);
    return;
  }

  if (node.type === 'TableConstructorExpression') {
    for (const field of (node.fields as LuaNode[] | undefined) ?? []) {
      walkExpression((field.value as LuaNode | undefined) ?? field, scopes, model, markers);
    }
  }
}

function walkStatements(
  statements: LuaNode[],
  scopes: LuaScope[],
  model: monaco.editor.ITextModel,
  markers: monaco.editor.IMarkerData[],
) {
  for (const statement of statements) {
    if (statement.type === 'LocalStatement' || statement.type === 'AssignmentStatement') {
      const variables = (statement.variables as LuaNode[] | undefined) ?? [];
      const init = (statement.init as LuaNode[] | undefined) ?? [];

      for (const expression of init) {
        walkExpression(expression, scopes, model, markers);
      }

      for (let index = 0; index < variables.length; index += 1) {
        const variable = variables[index];
        if (variable?.type !== 'Identifier') continue;
        const inferred = inferExpressionType(init[index], scopes, model);
        if (inferred) {
          scopes[scopes.length - 1].set(String(variable.name), inferred);
        }
      }
      continue;
    }

    if (statement.type === 'CallStatement') {
      walkExpression(statement.expression as LuaNode | undefined, scopes, model, markers);
      continue;
    }

    if (statement.type === 'ReturnStatement') {
      for (const argument of (statement.arguments as LuaNode[] | undefined) ?? []) {
        walkExpression(argument, scopes, model, markers);
      }
      continue;
    }

    if (statement.type === 'FunctionDeclaration') {
      const localScope: LuaScope = new Map();
      const parameters = (statement.parameters as LuaNode[] | undefined) ?? [];
      parameters.forEach((parameter, index) => {
        if (parameter?.type !== 'Identifier') return;
        const inferredType = inferFunctionParameterType(statement, String(parameter.name), index);
        if (inferredType) {
          localScope.set(String(parameter.name), inferredType);
        }
      });
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, localScope], model, markers);
      continue;
    }

    if (statement.type === 'IfStatement') {
      const clauses = (statement.clauses as LuaNode[] | undefined) ?? [];
      walkExpression((clauses[0]?.condition as LuaNode | undefined) ?? undefined, scopes, model, markers);
      for (const clause of clauses) {
        if ((clause.condition as LuaNode | undefined) && clause !== clauses[0]) {
          walkExpression(clause.condition as LuaNode | undefined, scopes, model, markers);
        }
        walkStatements((clause.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      }
      continue;
    }

    if (statement.type === 'WhileStatement' || statement.type === 'RepeatStatement') {
      walkExpression(statement.condition as LuaNode | undefined, scopes, model, markers);
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      continue;
    }

    if (statement.type === 'DoStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
      continue;
    }

    if (statement.type === 'ForNumericStatement' || statement.type === 'ForGenericStatement') {
      walkStatements((statement.body as LuaNode[] | undefined) ?? [], [...scopes, new Map()], model, markers);
    }
  }
}

function validateStaticTypes(ast: LuaNode, model: monaco.editor.ITextModel, markers: monaco.editor.IMarkerData[]) {
  const rootScope: LuaScope = new Map();
  for (const namespace of GLOBAL_NAMESPACES) {
    rootScope.set(namespace, namespace);
  }
  walkStatements((ast.body as LuaNode[] | undefined) ?? [], [rootScope], model, markers);
}

function inferReceiverNamespace(model: monaco.editor.ITextModel, receiverName: string, lineNumber: number) {
  const escapedReceiver = receiverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const assignmentPattern = new RegExp(
    `(?:local\\s+)?(?:[A-Za-z_][\\w]*\\s*,\\s*)*${escapedReceiver}\\s*(?:,\\s*[A-Za-z_][\\w]*)*\\s*=\\s*([A-Za-z_][\\w.]*)\\s*\\(`,
    'g',
  );

  for (let currentLine = lineNumber; currentLine >= 1; currentLine -= 1) {
    const line = model.getLineContent(currentLine);
    const matches = Array.from(line.matchAll(assignmentPattern));
    const functionName = matches.at(-1)?.[1];
    if (!functionName) continue;

    const functionItem = getFunctionForCall(functionName);
    const returnType = functionItem ? getPrimaryReturnType(functionItem) : null;
    if (returnType && METHOD_NAMESPACES.has(returnType)) {
      return returnType;
    }
  }

  return null;
}

function skipWhitespaceBackward(text: string, index: number) {
  let current = index;
  while (current >= 0 && /\s/.test(text[current] ?? '')) {
    current -= 1;
  }
  return current;
}

function findMatchingOpenParen(text: string, closeIndex: number) {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const char = text[index];
    if (char === ')') {
      depth += 1;
      continue;
    }
    if (char === '(') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function splitTrailingMemberExpression(text: string) {
  const trimmed = text.trimEnd();
  let index = skipWhitespaceBackward(trimmed, trimmed.length - 1);
  const memberEnd = index + 1;
  while (index >= 0 && /\w/.test(trimmed[index] ?? '')) {
    index -= 1;
  }

  const memberName = trimmed.slice(index + 1, memberEnd);
  if (!memberName) {
    return null;
  }

  index = skipWhitespaceBackward(trimmed, index);
  const indexer = trimmed[index];
  if (indexer !== ':' && indexer !== '.') {
    return null;
  }

  const receiver = trimmed.slice(0, index).trimEnd();
  if (!receiver) {
    return null;
  }

  return {
    receiver,
    indexer,
    memberName,
  } as const;
}

function inferExpressionNamespaceFromText(
  expressionText: string,
  visibleSymbols: LuaVisibleSymbol[],
  model: monaco.editor.ITextModel,
  lineNumber: number,
  depth = 0,
): LuaStaticType | null {
  const trimmed = expressionText.trim();
  if (!trimmed || depth > 8) {
    return null;
  }

  if (/^[A-Za-z_][\w]*$/.test(trimmed)) {
    const symbol = visibleSymbols.find((item) => item.name === trimmed);
    if (symbol?.typeName) {
      return symbol.typeName;
    }
    return GLOBAL_NAMESPACES.has(trimmed)
      ? trimmed
      : inferReceiverNamespace(model, trimmed, lineNumber);
  }

  if (trimmed.endsWith(')')) {
    const openParenIndex = findMatchingOpenParen(trimmed, trimmed.length - 1);
    if (openParenIndex > 0) {
      const calleeExpression = trimmed.slice(0, openParenIndex).trimEnd();
      const memberAccess = splitTrailingMemberExpression(calleeExpression);
      if (memberAccess) {
        const receiverNamespace = inferExpressionNamespaceFromText(
          memberAccess.receiver,
          visibleSymbols,
          model,
          lineNumber,
          depth + 1,
        );
        const functionItem = receiverNamespace
          ? functionsByName.get(`${receiverNamespace}.${memberAccess.memberName}`) ?? null
          : null;
        return functionItem ? normalizeStaticType(getPrimaryReturnType(functionItem)) : null;
      }

      const functionItem = getFunctionForCall(calleeExpression);
      return functionItem ? normalizeStaticType(getPrimaryReturnType(functionItem)) : null;
    }
  }

  const memberAccess = splitTrailingMemberExpression(trimmed);
  if (!memberAccess) {
    return null;
  }

  const receiverNamespace = inferExpressionNamespaceFromText(
    memberAccess.receiver,
    visibleSymbols,
    model,
    lineNumber,
    depth + 1,
  );
  const functionItem = receiverNamespace
    ? functionsByName.get(`${receiverNamespace}.${memberAccess.memberName}`) ?? null
    : null;
  return functionItem ? normalizeStaticType(getPrimaryReturnType(functionItem)) : null;
}

function getNamespaceCompletionContext(model: monaco.editor.ITextModel, position: monaco.Position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const namespaceMatch = linePrefix.match(/([A-Za-z_][\w]*)\.\s*([A-Za-z_]*)$/);
  if (namespaceMatch) {
    return {
      kind: 'namespace' as const,
      namespace: namespaceMatch[1],
      partial: namespaceMatch[2] ?? '',
    };
  }

  const partialMatch = linePrefix.match(/([A-Za-z_]*)$/);
  const partial = partialMatch?.[1] ?? '';
  const prefixWithoutPartial = linePrefix.slice(0, linePrefix.length - partial.length);
  const colonIndex = skipWhitespaceBackward(prefixWithoutPartial, prefixWithoutPartial.length - 1);
  if (colonIndex < 0 || prefixWithoutPartial[colonIndex] !== ':') return null;

  return {
    kind: 'method' as const,
    receiver: prefixWithoutPartial.slice(0, colonIndex).trimEnd(),
    namespace: null,
    partial,
  };
}

function buildFunctionDocumentation(item: LuaFunctionItem) {
  return toMarkdownParagraphs([
    `**${item.name}**`,
    `\`${toSignatureLabel(item)}\``,
    item.description,
  ]);
}

function buildScriptFunctionDocumentation(item: LuaScriptFunctionSymbol) {
  return toMarkdownParagraphs([
    `**${item.name}**`,
    `\`${item.signature}\``,
    item.documentation || '当前脚本中定义的函数。',
  ]);
}

function getInlineDescription(text: string, fallback = '') {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? fallback;

  if (!firstLine) return undefined;
  return firstLine.length > 28 ? `${firstLine.slice(0, 28)}...` : firstLine;
}

function normalizeCompletionHint(text: string, fallback = '') {
  const normalized = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  const hint = (normalized.length > 0 ? normalized.join('\n') : fallback.trim()) || '';
  if (!hint) return null;
  return hint.length > 900 ? `${hint.slice(0, 900).trimEnd()}...` : hint;
}

function buildConstantDocumentation(name: string, value: string, description: string) {
  return toMarkdownParagraphs([
    `**${name}**`,
    `\`${name} = ${value}\``,
    description,
  ]);
}

function buildReferenceSearchText(parts: Array<string | null | undefined>) {
  return parts
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

function buildConstantReferenceManualItem(item: LuaConstantItem): LuaReferenceManualItem {
  const category = item.category?.trim() || 'General';
  const description = normalizeCompletionHint(item.description, `${item.name} = ${item.value}`) ?? '';
  return {
    key: `constant:${item.name}`,
    title: item.name,
    detail: `${item.name} = ${item.value}`,
    description,
    category,
    valueText: item.value,
    insertText: item.name,
    insertAsSnippet: false,
    searchText: buildReferenceSearchText([
      item.name,
      item.value,
      item.description,
      category,
    ]),
  };
}

function buildFunctionReferenceManualItem(item: LuaFunctionItem): LuaReferenceManualItem {
  const category = item.category?.trim() || item.namespace || 'General';
  const description = normalizeCompletionHint(item.description, item.signature) ?? '';
  return {
    key: `function:${item.name}`,
    title: item.name,
    detail: toSignatureLabel(item),
    description,
    category,
    valueText: '',
    insertText: buildFunctionInsertText(item.name, item),
    insertAsSnippet: true,
    searchText: buildReferenceSearchText([
      item.name,
      item.shortName,
      item.signature,
      item.returnType,
      item.description,
      category,
    ]),
  };
}

function getSemanticDocument(model: monaco.editor.ITextModel) {
  return getLuaSemanticDocument(model as unknown as LuaSemanticTextModel, luaCatalog);
}

function getScriptFunctionSymbols(model: monaco.editor.ITextModel) {
  return getFunctionSymbols(getSemanticDocument(model));
}

function getScriptFunctionByName(model: monaco.editor.ITextModel, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  return getScriptFunctionSymbols(model).find((item) => item.name === trimmed || item.shortName === trimmed) ?? null;
}

function getMethodNamespace(receiver: string, visibleSymbols: LuaVisibleSymbol[]) {
  const symbol = visibleSymbols.find((item) => item.name === receiver);
  if (symbol?.typeName) return symbol.typeName;
  return GLOBAL_NAMESPACES.has(receiver) ? receiver : null;
}

function getFunctionForCall(name: string) {
  if (functionsByName.has(name)) {
    return functionsByName.get(name) ?? null;
  }

  const byShortName = functionsByShortName.get(name) ?? [];
  return byShortName.length === 1 ? byShortName[0] : null;
}

function getStringHint(context: LuaModelContext | undefined, index: number) {
  if (!context) return null;
  const text = context.strings[index] ?? '';
  return text.trim() ? text : null;
}

function getSnippetCompletionContext(model: monaco.editor.ITextModel, position: monaco.Position) {
  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const match = linePrefix.match(/(#[_A-Za-z0-9]*)$/);
  if (!match) return null;

  return {
    prefix: match[1],
    startColumn: position.column - match[1].length,
    endColumn: position.column,
  };
}

function provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
  const semanticDocument = getSemanticDocument(model);
  const activeCall = getCallInfoAt(semanticDocument, {
    lineNumber: position.lineNumber,
    column: position.column,
  });
  const insertFunctionReferenceOnly = shouldInsertFunctionReferenceOnly(
    activeCall?.target?.parameters ?? null,
    activeCall?.activeParameter ?? -1,
  );
  const visibleSymbols = getVisibleSymbolsAt(semanticDocument, {
    lineNumber: position.lineNumber,
    column: position.column,
  });
  const word = model.getWordUntilPosition(position);
  const snippetContext = getSnippetCompletionContext(model, position);
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const namespaceContext = (() => {
    const rawContext = getNamespaceCompletionContext(model, position);
    if (!rawContext || rawContext.kind !== 'method') return rawContext;
    return {
      ...rawContext,
      namespace: inferExpressionNamespaceFromText(rawContext.receiver, visibleSymbols, model, position.lineNumber)
        ?? getMethodNamespace(rawContext.receiver, visibleSymbols),
    };
  })();
  const currentWord = word.word.toLowerCase();
  const suggestions: monaco.languages.CompletionItem[] = [];
  const seenSuggestionLabels = new Set<string>();

  const pushSuggestion = (suggestion: monaco.languages.CompletionItem) => {
    const labelText = typeof suggestion.label === 'string' ? suggestion.label : suggestion.label.label;
    if (seenSuggestionLabels.has(labelText)) return;
    seenSuggestionLabels.add(labelText);
    suggestions.push(suggestion);
  };

  for (const snippet of luaCatalog.snippets) {
    if (namespaceContext) break;
    const snippetRange = snippetContext
      ? new monaco.Range(position.lineNumber, snippetContext.startColumn, position.lineNumber, snippetContext.endColumn)
      : range;
    const snippetFilter = snippetContext ? snippetContext.prefix.toLowerCase() : currentWord;

    if (snippetFilter && !snippet.prefix.toLowerCase().includes(snippetFilter) && !snippet.name.toLowerCase().includes(snippetFilter)) {
      continue;
    }

    pushSuggestion({
      label: snippet.prefix,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: snippet.body.join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: snippet.description,
      sortText: snippet.sortText,
      range: snippetRange,
    });
  }

  if (!namespaceContext) {
    const scopedIdentifiers = currentWord
      ? visibleSymbols.filter((item) => item.name.toLowerCase().includes(currentWord))
      : [];

    for (const item of scopedIdentifiers) {
      pushSuggestion({
        label: {
          label: item.name,
          description: item.kind === 'parameter'
            ? 'parameter'
            : item.kind === 'loop'
              ? 'loop local'
              : item.kind === 'function'
                ? 'local function'
                : 'local',
        },
        kind: item.kind === 'function'
          ? monaco.languages.CompletionItemKind.Function
          : monaco.languages.CompletionItemKind.Variable,
        insertText: item.name,
        detail: item.kind === 'parameter'
          ? 'Function parameter'
          : item.kind === 'function'
            ? 'Local function'
            : 'Local variable',
        sortText: `0500-${item.name}`,
        range,
      });
    }

    for (const keyword of luaCatalog.keywords) {
      if (currentWord && !keyword.startsWith(currentWord)) continue;
      pushSuggestion({
        label: keyword,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        sortText: `1000-${keyword}`,
        range,
      });
    }
  }

  const functions = namespaceContext
    ? namespaceContext.kind === 'namespace'
      ? functionsByNamespace.get(namespaceContext.namespace) ?? []
      : namespaceContext.namespace
        ? functionsByNamespace.get(namespaceContext.namespace) ?? []
        : Array.from(METHOD_NAMESPACES).flatMap((namespace) => functionsByNamespace.get(namespace) ?? [])
    : currentWord
      ? luaCatalog.functions
      : [];
  const scriptFunctions = getFunctionSymbols(semanticDocument).filter((item) => {
    if (namespaceContext) {
      if (namespaceContext.kind === 'namespace') {
        return item.namespace === namespaceContext.namespace;
      }

      return namespaceContext.namespace
        ? item.namespace === namespaceContext.namespace
        : Boolean(item.namespace);
    }

    return currentWord
      ? item.name.toLowerCase().includes(currentWord) || item.shortName.toLowerCase().includes(currentWord)
      : false;
  });

  for (const item of functions) {
    const displayName = namespaceContext ? item.shortName : item.name;
    const filterTarget = namespaceContext ? namespaceContext.partial.toLowerCase() : currentWord;
    if (filterTarget && !displayName.toLowerCase().includes(filterTarget) && !item.name.toLowerCase().includes(filterTarget)) {
      continue;
    }

    if (namespaceContext?.kind === 'method' && namespaceContext.namespace && item.namespace !== namespaceContext.namespace) {
      continue;
    }

    pushSuggestion({
      label: {
        label: displayName,
        description: getInlineDescription(item.description, item.signature),
      },
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: insertFunctionReferenceOnly
        ? displayName
        : buildFunctionInsertText(displayName, item, {
            omitFirstParameter: namespaceContext?.kind === 'method',
          }),
      insertTextRules: insertFunctionReferenceOnly
        ? monaco.languages.CompletionItemInsertTextRule.None
        : monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: toSignatureLabel(item),
      documentation: buildFunctionDocumentation(item),
      sortText: `2000-${displayName}`,
      range,
    });
  }

  for (const item of scriptFunctions) {
    const displayName = namespaceContext ? item.shortName : item.name;
    const completionParameters = getCompletionInsertParameters(item.parameters);
    pushSuggestion({
      label: {
        label: displayName,
        description: 'current script',
      },
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: insertFunctionReferenceOnly
        ? displayName
        : `${displayName}(${completionParameters.join(',')})`,
      detail: item.signature,
      documentation: buildScriptFunctionDocumentation(item),
      sortText: `2100-${displayName}`,
      range,
    });
  }

  if (!namespaceContext && currentWord) {
    for (const item of luaCatalog.constants) {
      if (!item.name.toLowerCase().includes(currentWord)) continue;
      pushSuggestion({
        label: {
          label: item.name,
          description: getInlineDescription(item.description, item.value),
        },
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: item.name,
        detail: item.value,
        documentation: buildConstantDocumentation(item.name, item.value, item.description),
        sortText: `3000-${item.name}`,
        range,
      });
    }
  }

  const linePrefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
  const stringIdMatch = linePrefix.match(/aux\.Stringid\s*\(\s*id\s*,\s*(\d*)$/);
  if (stringIdMatch) {
    const context = modelContexts.get(model.uri.toString());
    for (let index = 0; index < Math.max(context?.strings.length ?? 0, 16); index += 1) {
      pushSuggestion({
        label: String(index),
        kind: monaco.languages.CompletionItemKind.Value,
        insertText: String(index),
        detail: context?.strings[index] || `str${index + 1}`,
        documentation: context?.strings[index] || `str${index + 1} is empty`,
        sortText: `0000-${index.toString().padStart(2, '0')}`,
        range,
      });
    }
  }

  return { suggestions };
}

function provideHover(model: monaco.editor.ITextModel, position: monaco.Position) {
  const hoverInfo = getHoverInfoAt(getSemanticDocument(model), {
    lineNumber: position.lineNumber,
    column: position.column,
  });
  if (hoverInfo) {
    const documentation = hoverInfo.kind === 'constant'
      ? buildConstantDocumentation(hoverInfo.item.name, hoverInfo.item.value, hoverInfo.item.description)
      : hoverInfo.kind === 'catalog-function'
        ? buildFunctionDocumentation(hoverInfo.item)
        : buildScriptFunctionDocumentation(hoverInfo.item);

    return {
      range: new monaco.Range(
        hoverInfo.range.startLineNumber,
        hoverInfo.range.startColumn,
        hoverInfo.range.endLineNumber,
        hoverInfo.range.endColumn,
      ),
      contents: [{ value: documentation }],
    };
  }

  const line = model.getLineContent(position.lineNumber);
  for (const match of line.matchAll(/aux\.Stringid\s*\(\s*id\s*,\s*(\d+)\s*\)/g)) {
    const startIndex = match.index ?? -1;
    if (startIndex === -1) continue;
    const endIndex = startIndex + match[0].length;
    if (position.column - 1 < startIndex || position.column - 1 > endIndex) continue;

    const context = modelContexts.get(model.uri.toString());
    const stringIndex = Number(match[1]);
    const hint = getStringHint(context, stringIndex);
    if (!hint) return null;

    return {
      range: new monaco.Range(position.lineNumber, startIndex + 1, position.lineNumber, endIndex + 1),
      contents: [
        {
          value: toMarkdownParagraphs([
            `**aux.Stringid(id, ${stringIndex})**`,
            `当前文本: ${hint}`,
          ]),
        },
      ],
    };
  }

  return null;
}

function provideSignatureHelp(model: monaco.editor.ITextModel, position: monaco.Position) {
  const callInfo = getCallInfoAt(getSemanticDocument(model), {
    lineNumber: position.lineNumber,
    column: position.column,
  });
  if (!callInfo?.target) return null;

  const parameters = callInfo.target.parameters;

  return {
    value: {
      signatures: [
        {
          label: callInfo.target.signature,
          documentation: callInfo.target.documentation,
          parameters: parameters.map((parameter) => ({
            label: parameter,
          })),
        },
      ],
      activeSignature: 0,
      activeParameter: Math.min(callInfo.activeParameter, Math.max(0, parameters.length - 1)),
    },
    dispose() {},
  };
}

function registerProviders() {
  if (providersRegistered) return;

  monaco.languages.registerCompletionItemProvider('lua', {
    triggerCharacters: ['.', ':', '(', '#'],
    provideCompletionItems,
  });

  monaco.languages.registerHoverProvider('lua', {
    provideHover,
  });

  monaco.languages.registerSignatureHelpProvider('lua', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp,
  });

  providersRegistered = true;
}

export async function loadMonaco() {
  await ensureLuaCatalogLoaded();
  await ensureLuaDiagnosticsCatalogLoaded();
  ensureMonacoEnvironment();
  registerProviders();
  syncMonacoTheme();
  return monaco;
}

export function createScriptModelUri(tabId: string) {
  return monaco.Uri.parse(`inmemory://dataeditory/script-${tabId}.lua`);
}

export function setModelContext(model: monaco.editor.ITextModel, context: LuaModelContext) {
  modelContexts.set(model.uri.toString(), context);
}

export function clearModelContext(model: monaco.editor.ITextModel) {
  modelContexts.delete(model.uri.toString());
}

export function lookupCompletionDescription(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return null;

  if (functionsByName.has(trimmed)) {
    return normalizeCompletionHint(functionsByName.get(trimmed)?.description ?? '', functionsByName.get(trimmed)?.signature ?? '');
  }

  const shortNameMatches = functionsByShortName.get(trimmed) ?? [];
  if (shortNameMatches.length === 1) {
    return normalizeCompletionHint(shortNameMatches[0].description, shortNameMatches[0].signature);
  }

  if (constantDescriptionsByName.has(trimmed)) {
    return normalizeCompletionHint(constantDescriptionsByName.get(trimmed) ?? '');
  }

  return null;
}

export function getCurrentFunctionHint(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
) {
  const semanticDocument = getSemanticDocument(model);
  const activeCall = getCallInfoAt(semanticDocument, {
    lineNumber: position.lineNumber,
    column: position.column,
  });
  if (activeCall?.target) {
    if (activeCall.target.kind !== 'catalog' || activeCall.target.item.category !== 'Typed Definitions') {
      return null;
    }

    return {
      title: activeCall.target.signature,
      description: activeCall.target.documentation || '当前正在编辑的调用。',
    };
  }
  return null;
}

export function getToolbarSnippets() {
  return luaCatalog.snippets;
}

export function getReferenceManualItems(kind: LuaReferenceManualKind) {
  if (kind === 'constants') {
    return luaCatalog.constants.map(buildConstantReferenceManualItem);
  }

  return luaCatalog.functions.map(buildFunctionReferenceManualItem);
}

export function insertSnippet(
  editor: monaco.editor.IStandaloneCodeEditor,
  snippet: string,
) {
  const controller = SnippetController2.get(editor);
  if (controller) {
    controller.insert(snippet);
    return true;
  }

  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model) {
    return false;
  }

  editor.executeEdits('script-toolbar', [
    {
      range: selection,
      text: snippet,
      forceMoveMarkers: true,
    },
  ]);
  return true;
}

export function validateLuaModel(model: monaco.editor.ITextModel) {
  const markers = analyzeLuaScript(model.getValue()).map((diagnostic) => ({
    severity: diagnostic.severity === 'error'
      ? monaco.MarkerSeverity.Error
      : monaco.MarkerSeverity.Warning,
    message: diagnostic.message,
    startLineNumber: diagnostic.startLineNumber,
    startColumn: diagnostic.startColumn,
    endLineNumber: diagnostic.endLineNumber,
    endColumn: diagnostic.endColumn,
  }));

  monaco.editor.setModelMarkers(model, LUA_MARKER_OWNER, markers);
}
