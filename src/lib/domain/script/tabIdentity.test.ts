import { describe, expect, test } from 'bun:test';
import {
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
});
