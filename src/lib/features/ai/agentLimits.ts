export const DEFAULT_AGENT_MAX_STEPS = 100;

export function normalizeAgentMaxSteps(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_AGENT_MAX_STEPS;
  }

  return Math.min(200, Math.max(1, Math.round(Number(value))));
}
