import { describe, expect, test } from 'bun:test';
import { applyScriptTemplate, buildScriptFileName, normalizeGeneratedScript, normalizeScriptContent } from './workspace';

describe('script workspace helpers', () => {
  test('normalizes line endings and fenced output', () => {
    expect(normalizeScriptContent('a\r\nb\r\n')).toBe('a\nb\n');
    expect(normalizeGeneratedScript('```lua\nprint(1)\n```')).toBe('print(1)\n');
  });

  test('builds script file names and template fallback names', () => {
    expect(buildScriptFileName(12345)).toBe('c12345.lua');
    expect(applyScriptTemplate('-- {卡名}', '', 7)).toBe('-- Card 7');
    expect(applyScriptTemplate('-- {卡名}', 'Blue-Eyes', 7)).toBe('-- Blue-Eyes');
  });
});
