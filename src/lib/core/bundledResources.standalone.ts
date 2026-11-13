import coverUrl from '../../../static/resources/cover.jpg?url';

const texts = import.meta.glob('../../../static/resources/strings/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const urls: Record<string, string> = { 'cover.jpg': coverUrl };
const textByPath = new Map(
  Object.entries(texts).map(([key, value]) => [key.replace('../../../static/resources/', ''), value]),
);

const normalize = (path: string) => path.replace(/^[/\\]+/, '').replaceAll('\\', '/');

export function bundledResourceUrl(path: string) {
  return urls[normalize(path)] ?? '';
}

export async function fetchBundledText(path: string) {
  const text = textByPath.get(normalize(path));
  if (text === undefined) throw new Error(`Resource is not bundled: ${path}`);
  return text;
}
