export function isFunctionReferenceParameter(parameter: string | null | undefined) {
  return /\bfunction\b/i.test((parameter ?? '').trim());
}

function getParameterNameToken(parameter: string) {
  return parameter
    .replace(/[\[\]]/g, '')
    .split('=')
    .at(0)
    ?.trim()
    .split(/\s+/)
    .at(-1)
    ?.trim() ?? '';
}

function isOptionalCompletionParameter(parameter: string) {
  const trimmed = parameter.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return true;
  return getParameterNameToken(trimmed).endsWith('?');
}

function stripOptionalParameterBlock(parameter: string) {
  const optionalStart = parameter.indexOf('[');
  if (optionalStart < 0 || !parameter.includes(']')) {
    return parameter.trim();
  }

  return parameter.slice(0, optionalStart).trim().replace(/,+$/, '').trim();
}

export function getCompletionInsertParameters(parameters: string[] | null | undefined) {
  if (!parameters?.length) {
    return [];
  }

  return parameters.flatMap((parameter) => {
    const trimmed = parameter.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.includes('[') && trimmed.includes(']')) {
      const requiredHead = stripOptionalParameterBlock(trimmed);
      if (!requiredHead || requiredHead.includes('...') || isOptionalCompletionParameter(requiredHead)) {
        return [];
      }
      return [requiredHead];
    }

    if (trimmed.includes('...')) {
      return [];
    }

    if (isOptionalCompletionParameter(trimmed)) {
      return [];
    }

    return [trimmed];
  });
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
