import { describe, expect, test } from 'bun:test';
import { getCdbPathIdentity } from './cdbPathIdentity';

describe('getCdbPathIdentity', () => {
  test('treats Windows extended-length and regular paths as the same CDB', () => {
    expect(getCdbPathIdentity('\\\\?\\D:\\Project\\cards.cdb'))
      .toBe(getCdbPathIdentity('d:/project/cards.cdb'));
  });

  test('normalizes extended UNC paths', () => {
    expect(getCdbPathIdentity('\\\\?\\UNC\\Server\\Share\\cards.cdb'))
      .toBe(getCdbPathIdentity('\\\\server\\share\\cards.cdb'));
  });

  test('ignores trailing separators for Windows paths', () => {
    expect(getCdbPathIdentity('C:\\Project\\cards.cdb\\'))
      .toBe(getCdbPathIdentity('c:/project/cards.cdb'));
  });

  test('keeps POSIX path casing significant', () => {
    expect(getCdbPathIdentity('/Project/cards.cdb'))
      .not.toBe(getCdbPathIdentity('/project/cards.cdb'));
  });
});
