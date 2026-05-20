import type { LuaFunctionItem } from '$lib/types';

export type LuaReferenceManualKind = 'constants' | 'functions';
export type LuaReferenceManualItem = {
  key: string;
  kind: LuaReferenceManualKind;
  title: string;
  detail: string;
  description: string;
  category: string;
  valueText: string;
  insertText: string;
  insertAsSnippet: boolean;
  searchText: string;
  namespace?: string;
  shortName?: string;
  parameters?: string[];
};

function stripParameterName(parameter: string) {
  const normalized = parameter.trim();
  if (!normalized) return normalized;
  const parts = normalized.split(/\s+/);
  return parts.at(-1)?.replace(/\?$/, '') || normalized;
}

function escapeSnippetPlaceholder(value: string) {
  return value.replace(/[$}\\]/g, '\\$&');
}

function getFunctionInsertParameters(item: Pick<LuaFunctionItem, 'parameters' | 'namespace'>, useMethodSyntax = false) {
  if (!useMethodSyntax || item.parameters.length === 0) {
    return item.parameters;
  }

  const [firstParameter, ...restParameters] = item.parameters;
  const firstParameterName = stripParameterName(firstParameter);
  if (
    (item.namespace === 'Card' && (firstParameterName === 'c' || firstParameterName === 'self'))
    || (item.namespace === 'Effect' && (firstParameterName === 'e' || firstParameterName === 'self'))
    || (item.namespace === 'Group' && (firstParameterName === 'g' || firstParameterName === 'self'))
  ) {
    return restParameters;
  }

  return item.parameters;
}

export function buildFunctionInsertText(
  displayName: string,
  item: Pick<LuaFunctionItem, 'parameters' | 'namespace'>,
  useMethodSyntax = false,
) {
  const parameters = getFunctionInsertParameters(item, useMethodSyntax).map(stripParameterName).filter(Boolean);
  if (parameters.length === 0) {
    return `${displayName}()`;
  }

  const placeholder = parameters
    .map((parameter, index) => `\${${index + 1}:${escapeSnippetPlaceholder(parameter)}}`)
    .join(', ');
  return `${displayName}(${placeholder})`;
}

export function resolveReferenceManualInsertText(
  item: LuaReferenceManualItem,
  options: {
    useMethodSyntax?: boolean;
  } = {},
) {
  if (item.kind !== 'functions' || !options.useMethodSyntax || !item.shortName || !item.parameters) {
    return item.insertText;
  }

  return buildFunctionInsertText(
    item.shortName,
    {
      namespace: item.namespace ?? 'global',
      parameters: item.parameters,
    },
    true,
  );
}
