import { describe, expect, test } from 'bun:test';
import { luaCatalog } from '$lib/data/lua-intel/catalog.generated';
import {
  getCallInfoAt,
  getCurrentFunctionAt,
  getFunctionSymbols,
  getHoverInfoAt,
  getLuaSemanticDocument,
  getVisibleSymbolsAt,
  type LuaSemanticTextModel,
} from './luaSemantic';

function createModel(source: string, versionId = 1): LuaSemanticTextModel {
  const lines = source.split('\n');
  return {
    uri: {
      toString() {
        return `inmemory://semantic-test-${versionId}.lua`;
      },
    },
    getValue() {
      return source;
    },
    getVersionId() {
      return versionId;
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? '';
    },
  };
}

describe('lua semantic document', () => {
  test('collects function symbols from AST declarations', () => {
    const source = [
      'local function helper(e,tp)',
      'end',
      '',
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
      'end',
      '',
      'function c12345678.initial_effect(c)',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source), luaCatalog);
    const symbols = getFunctionSymbols(document);

    expect(symbols.map((item) => item.name)).toEqual([
      'helper',
      's.target',
      'c12345678.initial_effect',
    ]);
    expect(document.scopeTree.some((item) => item.kind === 'function')).toBe(true);
  });

  test('keeps parameters visible during incomplete editing states', () => {
    const source = [
      'local s,id=GetID()',
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
      '  local c=e:GetHandler()',
      '  tp',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 2), luaCatalog);
    const visible = getVisibleSymbolsAt(document, { lineNumber: 4, column: 5 });

    expect(visible.some((item) => item.name === 'tp' && item.kind === 'parameter')).toBe(true);
    expect(visible.some((item) => item.name === 'c' && item.kind === 'local')).toBe(true);
  });

  test('resolves method calls from inferred local variable types', () => {
    const source = [
      'function s.initial_effect(c)',
      '  local e1=Effect.CreateEffect(c)',
      '  e1:SetDescription(',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 3), luaCatalog);
    const callInfo = getCallInfoAt(document, { lineNumber: 3, column: 21 });
    const hoverInfo = getHoverInfoAt(document, { lineNumber: 3, column: 8 });

    expect(callInfo?.target?.kind).toBe('catalog');
    expect(callInfo?.target?.kind === 'catalog' ? callInfo.target.item.name : '').toBe('Effect.SetDescription');
    expect(hoverInfo?.kind).toBe('catalog-function');
    expect(hoverInfo?.kind === 'catalog-function' ? hoverInfo.item.name : '').toBe('Effect.SetDescription');
  });

  test('finds the function currently being edited from cursor position', () => {
    const source = [
      '-- target helper',
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
      '  local c=e:GetHandler()',
      '  return c and tp',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 4), luaCatalog);
    const currentFunction = getCurrentFunctionAt(document, { lineNumber: 4, column: 10 });

    expect(currentFunction?.name).toBe('s.target');
    expect(currentFunction?.signature).toBe('s.target(e, tp, eg, ep, ev, re, r, rp, chk)');
    expect(currentFunction?.documentation).toBe('target helper');
  });
});
