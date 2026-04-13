const TEXT_LIKE_INPUT_TYPES = new Set([
  'text',
  'search',
  'number',
  'email',
  'url',
  'tel',
  'password',
]);

function shouldDisableAutofill(element: HTMLInputElement | HTMLTextAreaElement) {
  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  const type = (element.getAttribute('type') ?? 'text').toLowerCase();
  return TEXT_LIKE_INPUT_TYPES.has(type);
}

function applyAutofillGuards(node: HTMLElement) {
  const fields = node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
  for (const field of fields) {
    if (!shouldDisableAutofill(field)) continue;

    field.setAttribute('autocomplete', 'off');
    field.setAttribute('autocorrect', 'off');
    field.setAttribute('autocapitalize', 'off');
    field.setAttribute('spellcheck', 'false');
    field.setAttribute('data-form-type', 'other');
  }
}

export function disableAutofill(node: HTMLElement) {
  applyAutofillGuards(node);

  const observer = new MutationObserver(() => {
    applyAutofillGuards(node);
  });

  observer.observe(node, {
    childList: true,
    subtree: true,
  });

  return {
    destroy() {
      observer.disconnect();
    },
  };
}
