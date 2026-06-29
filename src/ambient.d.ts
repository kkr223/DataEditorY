declare module 'monaco-editor/esm/vs/editor/editor.api' {
  export * from 'monaco-editor';
}

declare module 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2' {
  import type { editor } from 'monaco-editor';

  export class SnippetController2 {
    static get(editor: editor.IStandaloneCodeEditor): SnippetController2 | null;
    insert(template: string): void;
  }
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare const __APP_BUILD_VARIANT__: "base" | "extra";
declare const __APP_BUILD_LABEL__: string;
declare const __APP_MODULE_IDS__: readonly string[];
