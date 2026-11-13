/**
 * Bundled app resources under `static/resources`. Hosted and desktop builds
 * serve them over HTTP; the standalone build swaps this module for an inlined
 * implementation (see `bundledResources.standalone.ts`).
 */
export function bundledResourceUrl(path: string) {
  return `/resources/${path.replace(/^[/\\]+/, '')}`;
}

export async function fetchBundledText(path: string) {
  const response = await fetch(bundledResourceUrl(path));
  if (!response.ok) throw new Error(`Failed to load resource ${path}: ${response.status}`);
  return response.text();
}
