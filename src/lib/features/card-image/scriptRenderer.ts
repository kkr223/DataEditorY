import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/lua/lua.contribution';
import { collectLuaInlineHighlights, type LuaInlineHighlightClassName } from '$lib/features/script-editor/lua/calls';

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

function getCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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
  defineThemes();
  monaco.editor.setTheme(getCurrentLuaThemeName());
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
