import { describe, expect, test } from 'bun:test';
import { luaCatalog } from '$lib/data/lua-intel/catalog.generated';
import {
  getCallInfoAt,
  getFunctionSymbols,
  getHoverInfoAt,
  getLuaSemanticDocument,
  getVisibleSymbolsAt,
  type LuaSemanticTextModel,
} from './semantic';

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

  test('resolves hover information for chained method calls', () => {
    const source = [
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)',
      '  return e:GetHandler():IsLocation(LOCATION_MZONE)',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 5), luaCatalog);
    const hoverInfo = getHoverInfoAt(document, { lineNumber: 2, column: 25 });

    expect(hoverInfo?.kind).toBe('catalog-function');
    expect(hoverInfo?.kind === 'catalog-function' ? hoverInfo.item.name : '').toBe('Card.IsLocation');
  });

  test('resolves hover on intermediate member of a chained call', () => {
    const source = [
      'function s.operation(e,tp,eg,ep,ev,re,r,rp)',
      '  local g=Duel.GetReleaseGroup(tp)',
      '  local tc=g:GetFirst()',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 6), luaCatalog);
    const hoverInfo = getHoverInfoAt(document, { lineNumber: 3, column: 14 });

    expect(hoverInfo?.kind).toBe('catalog-function');
    expect(hoverInfo?.kind === 'catalog-function' ? hoverInfo.item.name : '').toBe('Group.GetFirst');
  });

  test('resolves hover on first half of a chained call on the same line', () => {
    const source = [
      'function s.operation(e,tp,eg,ep,ev,re,r,rp)',
      '  local tc=Duel.GetReleaseGroup(tp):GetFirst()',
      'end',
      '',
    ].join('\n');

    const document = getLuaSemanticDocument(createModel(source, 7), luaCatalog);
    const hoverInfo = getHoverInfoAt(document, { lineNumber: 2, column: 22 });

    expect(hoverInfo?.kind).toBe('catalog-function');
    expect(hoverInfo?.kind === 'catalog-function' ? hoverInfo.item.name : '').toBe('Duel.GetReleaseGroup');
  });
});

