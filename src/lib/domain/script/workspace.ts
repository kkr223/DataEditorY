export function buildScriptFileName(cardCode: number) {
  return `c${cardCode}.lua`;
}

export function buildScriptImagePath(cdbPath: string, cardCode: number) {
  const normalized = cdbPath.trim();
  if (!normalized) return '';

  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  const directory = separatorIndex >= 0 ? normalized.slice(0, separatorIndex + 1) : '';
  return `${directory}${buildScriptFileName(cardCode).replace(/\.lua$/i, '.png')}`;
}

export function normalizeScriptContent(content: string) {
  return content.replace(/\r\n/g, '\n');
}

export function normalizeGeneratedScript(script: string) {
  const trimmed = script.trim();
  const fenced = trimmed.match(/```(?:lua)?\s*([\s\S]*?)```/i);
  return `${(fenced?.[1] ?? trimmed).trim()}\n`;
}

export function applyScriptTemplate(template: string, cardName: string, cardCode: number) {
  const safeName = cardName?.trim() || `Card ${cardCode}`;
  return (template || '').replaceAll('{卡名}', safeName);
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
