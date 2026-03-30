export function isFunctionReferenceParameter(parameter: string | null | undefined) {
  return /\bfunction\b/i.test((parameter ?? '').trim());
}

export function shouldInsertFunctionReferenceOnly(
  parameters: string[] | null | undefined,
  activeParameter: number,
) {
  if (!parameters || activeParameter < 0 || activeParameter >= parameters.length) {
    return false;
  }

  return isFunctionReferenceParameter(parameters[activeParameter]);
}
