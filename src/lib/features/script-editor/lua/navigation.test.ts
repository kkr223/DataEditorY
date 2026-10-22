import { expect, test } from 'bun:test';
import { luaCatalog } from '$lib/data/lua-intel/catalog.generated';
import { getLuaSemanticDocument } from './semantic';
import { findLuaNavigationTarget, getLuaLoadScriptLinks } from './navigation';

let sequence = 0;
function target(marked: string) {
  const offset = marked.indexOf('§');
  const prefix = marked.slice(0, offset).split('\n');
  const source = marked.replace('§', '');
  const lines = source.split('\n');
  const document = getLuaSemanticDocument({
    uri: { toString: () => `inmemory://navigation-${++sequence}.lua` },
    getValue: () => source, getVersionId: () => 1, getLineContent: (line) => lines[line - 1] ?? '',
  }, luaCatalog);
  return findLuaNavigationTarget(document, { lineNumber: prefix.length, column: prefix.at(-1)!.length + 1 });
}

test('local functions and forward script table callbacks jump to their exact declaration', () => {
  const local = target('local function helper() end\nhel§per()');
  expect(local?.kind === 'function' ? local.target : null).toEqual({ startLineNumber: 1, startColumn: 16, endLineNumber: 1, endColumn: 22 });
  const callback = target('local s,id=GetID()\nDuel.Test(s.oper§ation)\nfunction s.operation() end');
  expect(callback?.kind === 'function' ? callback.target.startLineNumber : null).toBe(3);
});

test('same-name local functions respect lexical scopes and parameter shadowing', () => {
  const result = target('local function helper() end\ndo\n local function helper() end\n hel§per()\nend');
  expect(result?.kind === 'function' ? result.target.startLineNumber : null).toBe(3);
  expect(target('local function helper() end\nfunction run(helper)\n hel§per()\nend')).toBeNull();
  expect(target('do\n local function helper() end\nend\nhel§per()')).toBeNull();
});

test('assigned functions are navigable without confusing unrelated tables', () => {
  const assigned = target('local f=function() end\nf§()');
  expect(assigned?.kind === 'function' ? assigned.target.startColumn : null).toBe(7);
  const member = target('local a={}\nlocal b={}\na.run=function() end\nb.run=function() end\na.r§un()');
  expect(member?.kind === 'function' ? member.target.startLineNumber : null).toBe(3);
  expect(target('local a={}\na.run=function() end\ndo\n local a={}\n a.r§un()\nend')).toBeNull();
});

test('colon calls and self calls resolve the same table method', () => {
  const direct = target('local t={}\nfunction t:run() end\nt:r§un()');
  expect(direct?.kind === 'function' ? direct.target.startLineNumber : null).toBe(2);
  const self = target('local t={}\nfunction t:run() end\nfunction t:start()\n self:r§un()\nend');
  expect(self?.kind === 'function' ? self.target.startLineNumber : null).toBe(2);
});

test('comments, ordinary strings and APIs without a file-local definition do not jump', () => {
  expect(target('local function helper() end\n-- hel§per()')).toBeNull();
  expect(target('local function helper() end\nlocal text="hel§per()"')).toBeNull();
  expect(target('Duel.Dest§roy(nil, 0)')).toBeNull();
});

test('incomplete calls remain navigable without treating comments or strings as code', () => {
  const result = target('local function helper() end\nhel§per(');
  expect(result?.kind === 'function' ? result.target.startLineNumber : null).toBe(1);
  const member = target('local s={}\nfunction s.operation() end\ns.oper§ation(');
  expect(member?.kind === 'function' ? member.target.startLineNumber : null).toBe(2);
  expect(target('local function helper() end\n-- hel§per()\nlocal x = ')).toBeNull();
  expect(target('local function helper() end\nlocal x="hel§per(')).toBeNull();
});

test('LoadScript string arguments and the loader name point to a literal path', () => {
  expect(target('Duel.LoadScript("sub/hel§per.lua")')).toEqual({
    kind: 'script', path: 'sub/helper.lua', origin: { startLineNumber: 1, startColumn: 17, endLineNumber: 1, endColumn: 33 },
  });
  expect(target("Duel.Load§Script('helper.lua')")?.kind).toBe('script');
  expect(target('Duel.LoadScript([=[sub/hel§per.lua]=])')?.kind).toBe('script');
  const escaped = target('Duel.LoadScript("sub\\\\hel§per.lua")');
  expect(escaped?.kind === 'script' ? escaped.path : null).toBe('sub\\helper.lua');
  expect(target('Duel.LoadScript("hel§per.lua"..suffix)')).toBeNull();
  expect(target('-- Duel.LoadScript("hel§per.lua")')).toBeNull();
  expect(target('Other.LoadScript("hel§per.lua")')).toBeNull();
  expect(target('Duel.LoadScript "hel§per.lua"')?.kind).toBe('script');
  expect(target('function run(Duel)\nDuel.LoadScript("hel§per.lua")\nend')).toBeNull();
});

test('document links cover both the loader name and its literal filename', () => {
  const source = 'Duel.LoadScript("helper.lua")\n-- Duel.LoadScript("ignored.lua")';
  const document = getLuaSemanticDocument({
    uri: { toString: () => 'inmemory://loadscript-links.lua' },
    getValue: () => source, getVersionId: () => 1, getLineContent: (line) => source.split('\n')[line - 1] ?? '',
  }, luaCatalog);
  const links = getLuaLoadScriptLinks(document);
  expect(links.map((link) => link.path)).toEqual(['helper.lua', 'helper.lua']);
  expect(links.map((link) => link.range.startColumn)).toEqual([17, 6]);
});
