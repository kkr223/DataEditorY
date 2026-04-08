import type { CardDataEntry } from "$lib/types";
import type { ScriptGenerationStage } from "$lib/services/scriptGenerationStages";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function pickCardImageFlow(_input: {
  activeCdbPath: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  setImageSrc: (src: string) => void;
}) {
  return;
}

export async function generateCardScriptFlow(_input: {
  activeCdbPath: string | null;
  activeTabId: string | null;
  draftCard: CardDataEntry;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: ScriptGenerationStage | "") => void;
  setScriptGenerationAbortController: (value: AbortController | null) => void;
}) {
  return;
}

export async function saveParsedCardsIndividuallyFlow(_input: {
  cards: CardDataEntry[];
  t: Translate;
  loadCardIntoDraft: (card: CardDataEntry) => void;
  handleSearch: (preserveSelection?: boolean) => Promise<boolean>;
  refreshDraftImage: (code: number, bustCache?: boolean) => Promise<void>;
}) {
  return false;
}

export async function openParseModalFlow(_input: {
  hasAiCapability: boolean;
  draftCard: CardDataEntry;
  setManuscriptInput: (value: string) => void;
  setParseModalOpen: (value: boolean) => void;
}) {
  return false;
}

export async function parseCardManuscriptFlow(_input: {
  hasAiCapability: boolean;
  manuscriptInput: string;
  activeCdbPath: string | null;
  currentCardCode: number | null;
  prepareForImport?: () => Promise<void> | void;
  t: Translate;
  setIsParsingManuscript: (value: boolean) => void;
  setParseModalOpen: (value: boolean) => void;
  setDraftCard: (card: CardDataEntry) => void;
  syncSetcodesFromCard: (card: CardDataEntry) => void;
  afterDraftApplied: () => Promise<void>;
  handleModify: () => Promise<void>;
  saveParsedCardsIndividually: (cards: CardDataEntry[]) => Promise<boolean>;
}) {
  return false;
}

export async function runEditorInstructionFlow(_input: {
  hasAiCapability: boolean;
  instruction: string;
  activeCdbPath: string | null;
  currentCardCode: number | null;
  currentCard: CardDataEntry;
  t: Translate;
  setIsRunning: (value: boolean) => void;
  refreshAfterExecution: () => Promise<void>;
  setLastResult: (value: string) => void;
}) {
  return false;
}
