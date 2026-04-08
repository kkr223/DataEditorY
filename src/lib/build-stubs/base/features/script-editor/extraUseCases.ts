import type { CardDataEntry, ScriptWorkspaceState } from "$lib/types";
import type { ScriptGenerationStage } from "$lib/services/scriptGenerationStages";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export async function generateScriptFromEditorFlow(_input: {
  tab: ScriptWorkspaceState | null;
  isGeneratingScript: boolean;
  cardContext: CardDataEntry | null;
  dbTabs: Array<{ id: string; path: string }>;
  t: Translate;
  setIsGeneratingScript: (value: boolean) => void;
  setScriptGenerationStage: (value: ScriptGenerationStage | "") => void;
  setAbortController: (value: AbortController | null) => void;
}) {
  return false;
}
