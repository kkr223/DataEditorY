// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { getBuildVariantConfig } from "./scripts/build-variant-config.mjs";

const ACTIVE_MODULES_PATH = fileURLToPath(new URL("./src/lib/modules/active.ts", import.meta.url));
const WEB_VARIANT_ALIASES = new Map([
  [fileURLToPath(new URL("./src/lib/platform/host/index.ts", import.meta.url)), fileURLToPath(new URL("./src/lib/platform/host/web.ts", import.meta.url))],
  [fileURLToPath(new URL("./src/lib/platform/transport/active.ts", import.meta.url)), fileURLToPath(new URL("./src/lib/platform/transport/worker.ts", import.meta.url))],
]);
const normalizeId = (/** @type {string} */ id) => id.split("?")[0].replaceAll("\\", "/").toLowerCase();

/**
 * Points `src/lib/modules/active.ts` at the variant entry selected by
 * APP_VARIANT, so builds never rewrite tracked source files.
 * @returns {import("vite").Plugin}
 */
function variantModulesPlugin() {
  const variant = getBuildVariantConfig();
  const activeId = normalizeId(ACTIVE_MODULES_PATH);
  const variantEntry = fileURLToPath(new URL(`./src/lib/modules/${variant.key}.ts`, import.meta.url));
  const aliases = variant.key === "web"
    ? new Map([...WEB_VARIANT_ALIASES].map(([from, to]) => [normalizeId(from), to]))
    : new Map();
  return {
    name: "dey-variant-modules",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!source.includes("active") && variant.key !== "web") return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const resolvedId = normalizeId(resolved.id);
      if (resolvedId === activeId) return variantEntry;
      return aliases.get(resolvedId) ?? null;
    },
  };
}

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 43127;
const host = globalThis.process?.env?.TAURI_DEV_HOST || DEFAULT_DEV_HOST;
// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    variantModulesPlugin(),
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-yugioh-card-ts",
              test: /[/\\]node_modules[/\\]yugioh-card-ts[/\\]/,
            },
            {
              name: "vendor-tauri",
              test: /[/\\]node_modules[/\\]@tauri-apps[/\\]/,
            },
            {
              name: "vendor-i18n",
              test: /[/\\]node_modules[/\\]svelte-i18n[/\\]/,
            },
          ],
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
