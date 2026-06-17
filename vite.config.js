import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { getBuildVariantConfig } from "./scripts/build-variant-config.mjs";

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 43127;
const DEFAULT_HMR_PORT = 43128;
const host = globalThis.process?.env?.TAURI_DEV_HOST || DEFAULT_DEV_HOST;
const variant = getBuildVariantConfig(globalThis.process?.env?.APP_VARIANT);
// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],
  define: {
    __APP_BUILD_VARIANT__: JSON.stringify(variant.key),
    __APP_BUILD_LABEL__: JSON.stringify(variant.label),
    __APP_MODULE_IDS__: JSON.stringify(variant.modules),
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

          if (normalizedId.includes("/node_modules/monaco-editor/esm/vs/basic-languages/lua/")) {
            return "vendor-monaco-lua";
          }

          if (normalizedId.includes("/node_modules/monaco-editor/")) {
            return "vendor-monaco";
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
    hmr: {
      protocol: "ws",
      host,
      port: DEFAULT_HMR_PORT,
    },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
