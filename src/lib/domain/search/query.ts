// ---------------------------------------------------------------------------
// Search query helpers
//
// The SQL WHERE-clause builder that previously lived here (`buildSearchQuery`)
// was dead production code: the live search path builds a CardSearchExpression
// AST via `buildCardSearchExpression` and compiles it to SQL in the Rust
// document host (`document_host/search.rs`). Keeping a second, parallel SQL
// dialect in TS was a maintenance hazard with no callers. Only the small,
// pure `parseSetcodeFilter` helper is still used by `searchExpression.ts`.
// ---------------------------------------------------------------------------

/** Parse a hex setcode string like "0x1af" or "12ab". */
export function parseSetcodeFilter(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const hex = s.toLowerCase().startsWith('0x') ? s.slice(2) : s;
  if (!/^[\da-f]{1,4}$/i.test(hex)) return null;
  return parseInt(hex, 16) & 0xffff;
}
