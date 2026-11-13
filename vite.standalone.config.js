// Standalone web build: a single self-contained index.html that runs from
// file:// without any server. It mounts the same root layout/page as the
// SvelteKit app, but without the SvelteKit router or module chunks.
import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { variantModulesPlugin } from "./scripts/vite-variant-plugin.mjs";

const STANDALONE_ALIASES = {
  // Module workers cannot load from file://; run the CDB host on the main thread.
  "src/lib/platform/transport/active.ts": "src/lib/platform/transport/inline.ts",
  "src/lib/core/bundledResources.ts": "src/lib/core/bundledResources.standalone.ts",
  // The text workbench pulls in Monaco and its workers; the web variant has no script editing.
  "src/lib/components/TextEditorWorkbench.svelte": "src/standalone/shims/Empty.svelte",
};

// Dynamic imports are inlined, so Vite's preload dependency lists are unused.
const escapeInlineScript = (/** @type {string} */ code) => code
  .replace(/"?__VITE_PRELOAD__"?/g, "void 0")
  .replace(/<(\/script|!--)/gi, "\\x3C$1");

/**
 * Inlines the single JS chunk and CSS file into index.html.
 * @returns {import("vite").Plugin}
 */
function inlineIntoHtmlPlugin() {
  return {
    name: "dey-inline-into-html",
    enforce: "post",
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find((item) => item.type === "asset" && item.fileName.endsWith(".html"));
      if (!htmlAsset || htmlAsset.type !== "asset") return;
      let html = String(htmlAsset.source);
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type === "chunk" && fileName.endsWith(".js")) {
          const pattern = new RegExp(`<script([^>]*?) src="[^"]*${fileName.replaceAll(".", "\\.")}"([^>]*)></script>`);
          html = html.replace(pattern, (_match, before, after) => (
            `<script${before.replace(/\s*crossorigin/, "")}${after}>${escapeInlineScript(item.code)}</script>`
          ));
          delete bundle[fileName];
        } else if (item.type === "asset" && fileName.endsWith(".css")) {
          const pattern = new RegExp(`<link[^>]*? href="[^"]*${fileName.replaceAll(".", "\\.")}"[^>]*>`);
          html = html.replace(pattern, () => `<style>${String(item.source)}</style>`);
          delete bundle[fileName];
        }
      }
      htmlAsset.source = html;
    },
  };
}

/**
 * Monaco is still linked by shared stores; inline its worker so the output
 * stays one file even though the web variant never opens a script editor.
 * @returns {import("vite").Plugin}
 */
function inlineWorkersPlugin() {
  return {
    name: "dey-inline-workers",
    enforce: "pre",
    transform(code, id) {
      if (!code.includes("?worker'") && !code.includes('?worker"')) return null;
      return code.replace(/\?worker(['"])/g, "?worker&inline$1");
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL("./src/standalone", import.meta.url)),
  base: "./",
  publicDir: false,
  plugins: [
    variantModulesPlugin({ variant: "web", aliases: STANDALONE_ALIASES }),
    inlineWorkersPlugin(),
    svelte({ preprocess: vitePreprocess() }),
    inlineIntoHtmlPlugin(),
  ],
  resolve: {
    alias: {
      "$app/env": fileURLToPath(new URL("./src/standalone/shims/app-env.ts", import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./build-standalone", import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 100000,
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
});
