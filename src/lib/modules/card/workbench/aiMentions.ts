import type { CardDataEntry } from '$lib/types';
import type { WorkspaceAiContextRef } from './workspaceMetadataState.svelte';

export type CardMentionToken = {
  start: number;
  end: number;
  query: string;
};

export type CardMentionRange = {
  start: number;
  end: number;
};

export function findCardMentionToken(text: string, cursor = text.length): CardMentionToken | null {
  const end = Math.max(0, Math.min(cursor, text.length));
  const prefix = text.slice(0, end);
  const match = /(^|\s)@([^\s@]*)$/.exec(prefix);
  if (!match) return null;
  return {
    start: end - match[2].length - 1,
    end,
    query: match[2],
  };
}

export function replaceCardMention(text: string, token: CardMentionToken, label: string) {
  const before = text.slice(0, token.start);
  const after = text.slice(token.end).replace(/^\s+/, '');
  const replacement = `@${label} `;
  return {
    text: `${before}${replacement}${after}`,
    cursor: before.length + replacement.length,
  };
}

export function cardMentionLabel(card: Pick<CardDataEntry, 'code' | 'name'>) {
  return card.name.trim() || String(card.code);
}

function refValue(ref: WorkspaceAiContextRef) {
  return ref.value && typeof ref.value === 'object'
    ? ref.value as Record<string, unknown>
    : {};
}

export function cardMentionTextFromRef(ref: WorkspaceAiContextRef) {
  const value = refValue(ref);
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const code = Number.isInteger(value.cardCode) ? String(value.cardCode) : '';
  const fallback = ref.label.replace(/^\d+\s*/, '').trim();
  const label = name || code || fallback;
  return label ? `@${label}` : '';
}

export function findKnownCardMentionRanges(
  text: string,
  refs: WorkspaceAiContextRef[],
): CardMentionRange[] {
  const ranges: CardMentionRange[] = [];
  for (const ref of refs) {
    const mention = cardMentionTextFromRef(ref);
    if (!mention) continue;

    let start = text.indexOf(mention);
    while (start >= 0) {
      const end = start + mention.length;
      const beforeOk = start === 0 || /\s/.test(text[start - 1]);
      const afterOk = end === text.length || /\s/.test(text[end]);
      if (beforeOk && afterOk) ranges.push({ start, end });
      start = text.indexOf(mention, start + 1);
    }
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function filterCardMentionContextRefsForText(
  text: string,
  refs: WorkspaceAiContextRef[],
) {
  return refs.filter((ref) => findKnownCardMentionRanges(text, [ref]).length > 0);
}

function includeTrailingSpace(text: string, end: number) {
  return end < text.length && /\s/.test(text[end]) ? end + 1 : end;
}

export function findCardMentionDeleteRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  refs: WorkspaceAiContextRef[],
  key: 'Backspace' | 'Delete',
): CardMentionRange | null {
  const start = Math.max(0, Math.min(selectionStart, text.length));
  const end = Math.max(start, Math.min(selectionEnd, text.length));
  const ranges = findKnownCardMentionRanges(text, refs);

  if (start !== end) {
    let nextStart = start;
    let nextEnd = end;
    let touched = false;
    for (const range of ranges) {
      if (start >= range.end || end <= range.start) continue;
      touched = true;
      nextStart = Math.min(nextStart, range.start);
      nextEnd = Math.max(nextEnd, includeTrailingSpace(text, range.end));
    }
    return touched ? { start: nextStart, end: nextEnd } : null;
  }

  for (const range of ranges) {
    const rangeEnd = includeTrailingSpace(text, range.end);
    if (key === 'Backspace' && start > range.start && start <= rangeEnd) {
      return { start: range.start, end: rangeEnd };
    }
    if (key === 'Delete' && start >= range.start && start < rangeEnd) {
      return { start: range.start, end: rangeEnd };
    }
  }
  return null;
}

export function removeCardMentionRange(text: string, range: CardMentionRange) {
  return {
    text: `${text.slice(0, range.start)}${text.slice(range.end)}`,
    cursor: range.start,
  };
}

export function createCardMentionContextRef(
  card: CardDataEntry,
  source?: { documentId?: string; cdbPath?: string },
): WorkspaceAiContextRef {
  return {
    type: 'card',
    label: `${card.code} ${cardMentionLabel(card)}`,
    value: {
      cardCode: card.code,
      name: card.name,
      type: card.type,
      attack: card.attack,
      defense: card.defense,
      level: card.level,
      desc: card.desc,
      documentId: source?.documentId,
      cdbPath: source?.cdbPath,
    },
  };
}

export function buildMentionContextPrompt(refs: WorkspaceAiContextRef[]) {
  const cards = refs
    .filter((ref) => ref.type === 'card')
    .map((ref) => ref.value && typeof ref.value === 'object' ? ref.value as Record<string, unknown> : {})
    .filter((value) => Number.isInteger(value.cardCode));
  if (!cards.length) return '';

  return [
    '已加入上下文的卡片：',
    ...cards.map((card) => [
      `- ${card.cardCode} ${String(card.name ?? '')}`,
      `  type=${card.type ?? ''} atk=${card.attack ?? ''} def=${card.defense ?? ''} level=${card.level ?? ''}`,
      `  desc=${String(card.desc ?? '').slice(0, 500)}`,
    ].join('\n')),
  ].join('\n');
}
