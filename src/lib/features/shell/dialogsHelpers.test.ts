import { describe, expect, test } from 'bun:test';
import {
  buildMergeAnalysisKey,
  isNewOutputPath,
} from '$lib/features/shell/dialogsHelpers';

describe('shell dialog helpers', () => {
  test('builds a stable merge analysis key from both paths', () => {
    expect(buildMergeAnalysisKey('a.cdb', 'b.cdb')).toBe('a.cdb::b.cdb');
  });

  test('detects whether an output path is still available', () => {
    expect(isNewOutputPath('c.cdb', ['a.cdb', 'b.cdb'])).toBe(true);
    expect(isNewOutputPath('a.cdb', ['a.cdb', 'b.cdb'])).toBe(false);
  });
});
