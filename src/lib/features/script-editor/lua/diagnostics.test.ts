import { describe, expect, test } from 'bun:test';
import { analyzeLuaScript } from './diagnostics';

describe('lua script diagnostics', () => {
  test('accepts a minimal valid script shape', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics).toEqual([]);
  });

  test('reports syntax and structure problems', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\tlocal e1=Effect.CreateEffect(c)',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.severity === 'error')).toBe(true);
    expect(diagnostics.some((item) => item.message.includes('未闭合'))).toBe(true);
  });

  test('reports unknown api members and arity mismatches', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\tDuel.NotARealApi()',
      '\tCard.IsType(c)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('not a known API member'))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes('expects'))).toBe(true);
  });

  test('reports undefined globals but allows legacy card namespace style', () => {
    const diagnostics = analyzeLuaScript([
      'function c12345678.initial_effect(c)',
      '\tlocal e1=Effect.CreateEffect(c)',
      '\te1:SetDescription(aux.Stringid(12345678,0))',
      '\tMissingHelper(e1)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('Undefined global variable: MissingHelper'))).toBe(true);
    expect(diagnostics.some((item) => item.message.includes('Undefined global variable: c12345678'))).toBe(false);
  });

  test('reports duplicate local definitions in the same scope', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.initial_effect(c)',
      '\tlocal e1=Effect.CreateEffect(c)',
      '\tlocal e1=Effect.CreateEffect(c)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('Duplicate definition: e1'))).toBe(true);
  });

  test('reports duplicate function parameters', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.target(e,tp,e)',
      '\treturn true',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('Duplicate definition: e'))).toBe(true);
  });

  test('reports duplicate script function declarations', () => {
    const diagnostics = analyzeLuaScript([
      'local s,id=GetID()',
      'function s.target(e,tp)',
      'end',
      'function s.target(e,tp)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('Duplicate definition: s.target'))).toBe(true);
  });

  test('reports duplicate global function declarations', () => {
    const diagnostics = analyzeLuaScript([
      'function helper(e,tp)',
      'end',
      'function helper(e,tp)',
      'end',
      '',
    ].join('\n'));

    expect(diagnostics.some((item) => item.message.includes('Duplicate definition: helper'))).toBe(true);
  });
});

