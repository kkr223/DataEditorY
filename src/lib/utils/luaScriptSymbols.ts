export type LuaScriptFunctionSymbol = {
  name: string;
  shortName: string;
  namespace: string | null;
  parameters: string[];
  signature: string;
};

const LOCAL_FUNCTION_PATTERN = /local\s+function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g;
const NAMED_FUNCTION_PATTERN = /function\s+((?:[A-Za-z_]\w*)(?:\.[A-Za-z_]\w*)?)\s*\(([^)]*)\)/g;

function parseParameters(parameterBlock: string) {
  return parameterBlock
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSymbol(rawName: string, parameterBlock: string): LuaScriptFunctionSymbol {
  const namespace = rawName.includes('.') ? rawName.split('.')[0] ?? null : null;
  const shortName = rawName.includes('.') ? rawName.split('.').at(-1) ?? rawName : rawName;
  const parameters = parseParameters(parameterBlock);

  return {
    name: rawName,
    shortName,
    namespace,
    parameters,
    signature: `${rawName}(${parameters.join(', ')})`,
  };
}

export function collectLuaScriptFunctionSymbols(source: string) {
  const symbols: LuaScriptFunctionSymbol[] = [];
  const seenNames = new Set<string>();

  for (const match of source.matchAll(LOCAL_FUNCTION_PATTERN)) {
    const name = match[1]?.trim();
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    symbols.push(buildSymbol(name, match[2] ?? ''));
  }

  for (const match of source.matchAll(NAMED_FUNCTION_PATTERN)) {
    const name = match[1]?.trim();
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    symbols.push(buildSymbol(name, match[2] ?? ''));
  }

  return symbols;
}
