import type { CardDataEntry } from '$lib/types';
import { cloneEditableCard } from '$lib/domain/card/draft';
import { normalizeCardPatch } from './aiProposalPayload';

type CardChange = { cardCode: number; before: unknown; patch: unknown };
type CardChangeAccess = {
  readCard: (code: number) => Promise<CardDataEntry | null>;
  confirmConflict: (code: number) => Promise<boolean>;
  commit: (cards: CardDataEntry[], expectedCards: CardDataEntry[]) => Promise<void>;
};

// Authorization mode never changes conflict detection. The host checks these
// exact read snapshots atomically when committing the complete batch.
export async function applyAiCardChanges(changes: CardChange[], access: CardChangeAccess) {
  const cards: CardDataEntry[] = [];
  const expectedCards: CardDataEntry[] = [];
  const seen = new Set<number>();
  for (const change of changes) {
    if (seen.has(change.cardCode)) throw new Error(`Duplicate card ${change.cardCode} in proposal`);
    seen.add(change.cardCode);
    const current = await access.readCard(change.cardCode);
    if (!current) throw new Error(`Card ${change.cardCode} is not open`);
    const patch = normalizeCardPatch(change.patch);
    if (!patch) throw new Error(`Invalid patch for card ${change.cardCode}`);
    if (patch.code !== undefined && patch.code !== current.code) {
      throw new Error('Use the card editor to change a card ID and its associated assets');
    }
    const before = change.before && typeof change.before === 'object'
      ? change.before as Partial<CardDataEntry> : null;
    const conflict = !before || Object.keys(patch).some((field) => {
      const key = field as keyof CardDataEntry;
      return JSON.stringify(current[key]) !== JSON.stringify(before[key]);
    });
    if (conflict && !(await access.confirmConflict(change.cardCode))) {
      throw new Error(`Skipped changed card ${change.cardCode}`);
    }
    expectedCards.push(current);
    cards.push(cloneEditableCard({ ...current, ...patch, code: current.code }));
  }
  if (cards.length) await access.commit(cards, expectedCards);
  return cards;
}
