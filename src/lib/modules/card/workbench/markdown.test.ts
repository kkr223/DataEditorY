import { describe, expect, test } from 'bun:test';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  test('renders common markdown and strips raw html', () => {
    const html = renderMarkdown([
      '# Title',
      '',
      '> Quote',
      '',
      '- item 1',
      '- item 2',
      '',
      '[OpenAI](https://openai.com)',
      '',
      '```ts',
      'const value = 1 < 2',
      '```',
      '',
      '<script>alert(1)</script>',
    ].join('\n'));

    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<a href="https://openai.com" target="_blank" rel="noreferrer noopener">OpenAI</a>');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('&lt;script');
    expect(html.includes('<script>')).toBe(false);
  });
});
