import { describe, expect, test } from 'bun:test';
import {
  findScriptTabByCard,
  getScriptTabKey,
  isSameCdbPath,
  isScriptTabOwnedByCdb,
} from './tabIdentity';

describe('script tab identity', () => {
  test('uses normalized CDB paths for script keys', () => {
    expect(getScriptTabKey('\\\\?\\D:\\Project\\cards.cdb', 483))
      .toBe(getScriptTabKey('d:/project/cards.cdb', 483));
  });

  test('matches a script to its source tab before consulting the path', () => {
    expect(isScriptTabOwnedByCdb(
      { sourceTabId: 'cdb-1', cdbPath: 'C:/old/cards.cdb' },
      { tabId: 'cdb-1', path: 'D:/new/cards.cdb' },
    )).toBe(true);
  });

  test('matches restored script metadata through equivalent Windows paths', () => {
    expect(isScriptTabOwnedByCdb(
      { sourceTabId: null, cdbPath: '\\\\?\\D:\\Project\\cards.cdb' },
      { tabId: 'cdb-1', path: 'd:/project/cards.cdb' },
    )).toBe(true);
    expect(isSameCdbPath('/Project/cards.cdb', '/project/cards.cdb')).toBe(false);
  });

  test('finds an open script using normalized CDB identity and card code', () => {
    const tabs = [{ cdbPath: '\\\\?\\D:\\Project\\cards.cdb', cardCode: 483, id: 'script-1' }];
    expect(findScriptTabByCard(tabs, 'd:/project/cards.cdb', 483)?.id).toBe('script-1');
    expect(findScriptTabByCard(tabs, 'd:/project/cards.cdb', 999)).toBeNull();
  });
  test('prefers the stable source CDB tab after Save As changes its path', () => {
    const tabs = [{ cdbPath: 'C:/old/cards.cdb', sourceTabId: 'cdb-1', cardCode: 483, id: 'script-1' }];
    expect(findScriptTabByCard(tabs, 'D:/new/cards.cdb', 483, 'cdb-1')?.id).toBe('script-1');
  });
});
