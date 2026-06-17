export const LUA_SCRIPT_TYPE = 'ygo.lua-script';

export type LuaScriptDocument = {
  content: string;
  language: 'lua';
};

export const validateLuaScriptDocument = (value: unknown): LuaScriptDocument => {
  if (!value || typeof value !== 'object') {
    throw new Error('Lua script document must be an object');
  }
  const document = value as Partial<LuaScriptDocument>;
  if (typeof document.content !== 'string') {
    throw new Error('Lua script content must be a string');
  }
  return {
    content: document.content.replaceAll('\r\n', '\n'),
    language: 'lua',
  };
};
