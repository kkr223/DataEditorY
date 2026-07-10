import { marked } from 'marked';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeMarkdownUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return /^(https?:|mailto:|tel:)/i.test(trimmed);
  }

  return true;
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.html = ({ text }) => escapeHtml(text);
markdownRenderer.link = function (this: InstanceType<typeof marked.Renderer>, { href, title, tokens }) {
  const safeHref = isSafeMarkdownUrl(href);
  const label = this.parser.parseInline(tokens);
  if (!safeHref) {
    return label;
  }

  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noreferrer noopener">${label}</a>`;
};
markdownRenderer.image = function (this: InstanceType<typeof marked.Renderer>, { href, title, text }) {
  const safeHref = isSafeMarkdownUrl(href);
  const altText = escapeHtml(text);
  if (!safeHref) {
    return altText ? `<span class="message-image-alt">${altText}</span>` : '';
  }

  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<img src="${escapeHtml(href)}" alt="${altText}"${titleAttr} loading="lazy" />`;
};

export function renderMarkdown(content: string) {
  return marked.parse(content, {
    gfm: true,
    breaks: true,
    renderer: markdownRenderer,
  }) as string;
}
