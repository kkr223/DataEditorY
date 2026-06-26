import type { CardDataEntry } from '$lib/types';

export type CardDraftValidationIssue = {
  severity: 'error' | 'warning';
  code: 'invalid-code' | 'empty-name' | 'empty-type';
};

export function validateCardDraft(card: CardDataEntry): CardDraftValidationIssue[] {
  const issues: CardDraftValidationIssue[] = [];
  const code = Number(card.code ?? 0);

  if (!Number.isInteger(code) || code <= 0) {
    issues.push({ severity: 'error', code: 'invalid-code' });
  }
  if (!card.name.trim()) {
    issues.push({ severity: 'warning', code: 'empty-name' });
  }
  if (!Number.isInteger(card.type) || card.type === 0) {
    issues.push({ severity: 'warning', code: 'empty-type' });
  }

  return issues;
}
