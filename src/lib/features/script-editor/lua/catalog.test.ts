import { describe, expect, test } from 'bun:test';
import { parseConstantCategory, parseConstants } from './catalog';

describe('lua intel constant parsing', () => {
  test('parses decorated section headers without swallowing explanatory comments', () => {
    expect(parseConstantCategory('--========== Reset ========== --重置条件')).toBe('Reset');
    expect(parseConstantCategory('--========== Codes ==========\t--对永续性效果表示效果类型')).toBe('Codes');
  });

  test('keeps plain comment categories and switches away from temporary sub-sections', () => {
    const constants = parseConstants([
      '--Summon info',
      'SUMMON_INFO_CODE=0x01',
      '--========== Reset ========== --重置条件',
      'RESET_SELF_TURN=0x10000000',
      '----组合时点',
      'RESETS_STANDARD=0x1fe0000',
      '--========== Types ========== --效果类型',
      'EFFECT_TYPE_SINGLE=0x0001',
      '--========== Flags ========== --效果标记',
      'EFFECT_FLAG_INITIAL=0x0001',
      '--========== Codes ========== --效果代码',
      'EFFECT_IMMUNE_EFFECT=1',
    ].join('\n'));

    expect(constants.find((item) => item.name === 'RESET_SELF_TURN')?.category).toBe('Reset');
    expect(constants.find((item) => item.name === 'RESETS_STANDARD')?.category).toBe('组合时点');
    expect(constants.find((item) => item.name === 'EFFECT_TYPE_SINGLE')?.category).toBe('Types');
    expect(constants.find((item) => item.name === 'EFFECT_FLAG_INITIAL')?.category).toBe('Flags');
    expect(constants.find((item) => item.name === 'EFFECT_IMMUNE_EFFECT')?.category).toBe('Codes');
  });
});

