import { test, expect } from 'bun:test';
import { basename, dirname, extname, fileStem, join, toForwardSlashes } from './path.ts';

test('basename handles both separators and roots', () => {
  expect(basename('C:\\cards\\old.cdb')).toBe('old.cdb');
  expect(basename('/home/user/a.cdb')).toBe('a.cdb');
  expect(basename('a.cdb')).toBe('a.cdb');
  expect(basename('C:\\')).toBe('');
  expect(basename('/')).toBe('');
  expect(basename('C:\\pics\\')).toBe('pics');
});

test('dirname keeps the dominant separator and roots', () => {
  expect(dirname('C:\\cards\\old.cdb')).toBe('C:\\cards');
  expect(dirname('/home/user/a.cdb')).toBe('/home/user');
  expect(dirname('a.cdb')).toBe('.');
  expect(dirname('C:\\cards')).toBe('C:\\');
  expect(dirname('/home')).toBe('/');
  expect(dirname('//server/share/a.cdb')).toBe('//server/share');
  expect(dirname('vfs://workspace/cards.cdb')).toBe('vfs://workspace');
});

test('join ignores empty parts and keeps separator style', () => {
  expect(join('C:\\cards', 'pics', '100.jpg')).toBe('C:\\cards\\pics\\100.jpg');
  expect(join('/home/user', 'pics', '100.jpg')).toBe('/home/user/pics/100.jpg');
  expect(join('/home/user/', 'pics/')).toBe('/home/user/pics');
  expect(join('', 'pics')).toBe('pics');
  expect(join('/root', '')).toBe('/root');
  expect(join('/root', '/pics')).toBe('/root/pics');
  expect(join('vfs://workspace', 'script', 'c100.lua')).toBe('vfs://workspace/script/c100.lua');
});

test('extname and fileStem', () => {
  expect(extname('a/b/c.CDB')).toBe('.CDB');
  expect(extname('a/b/noext')).toBe('');
  expect(extname('.hidden')).toBe('');
  expect(fileStem('C:\\a\\c100.lua')).toBe('c100');
});

test('toForwardSlashes normalizes windows paths', () => {
  expect(toForwardSlashes('C:\\a\\b')).toBe('C:/a/b');
});
