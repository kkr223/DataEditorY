import type { editor } from 'monaco-editor';

export const suppressFindCloseTooltip = (instance: editor.ICodeEditor) => {
  const host = instance.getContainerDomNode();
  const onMouseOver = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('.find-widget .codicon-widget-close')) return;

    // Stop Monaco's tooltip listener before it runs on the close button.
    // Click and keyboard events still reach the built-in find widget.
    event.stopPropagation();
  };

  host.addEventListener('mouseover', onMouseOver, true);
  instance.onDidDispose(() => host.removeEventListener('mouseover', onMouseOver, true));
};
