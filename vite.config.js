// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 43127;
const host = globalThis.process?.env?.TAURI_DEV_HOST || DEFAULT_DEV_HOST;
// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    {
      name: "isolate-dev-server-cache",
      apply: "serve",
      /** @param {import("vite").UserConfig} config */
      config(config) {
        // This hook sees CLI overrides such as --port as well as the defaults below.
        const port = config.server?.port ?? DEFAULT_DEV_PORT;
        return {
          cacheDir: `node_modules/.vite/dev-${port}`,
          server: { ws: { port: port + 1 } },
        };
      },
    },
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ fallback: "index.html" }),
      files: {
        assets:
          process.env.DATAEDITORY_WEB_BUILD === "1" ||
          process.env.npm_lifecycle_event === "build:web:raw"
            ? "static-web"
            : "static",
      },
      // Desktop bundles only change when installed; avoid hourly deployment polling.
      version: { pollInterval: 0 },
    }),
  ],
  optimizeDeps: {
    include: ["yugioh-card-ts", "yugioh-card-ts/document"],
  },
  build: {
    chunkSizeWarningLimit: 3900,
    rollupOptions: {
      output: {
        /** @param {string} id */
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");

          if (!normalizedId.includes("/node_modules/")) {
            return;
          }

          if (normalizedId.includes("/node_modules/yugioh-card-ts/")) {
            return "vendor-yugioh-card-ts";
          }

          if (normalizedId.includes("/node_modules/@tauri-apps/")) {
            return "vendor-tauri";
          }

          if (normalizedId.includes("/node_modules/svelte-i18n/")) {
            return "vendor-i18n";
          }

        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: DEFAULT_DEV_PORT,
    strictPort: true,
    host,
    ws: {
      protocol: "ws",
      host,
    },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
