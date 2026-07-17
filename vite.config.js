import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 43127;
const DEFAULT_HMR_PORT = 43128;
const host = globalThis.process?.env?.TAURI_DEV_HOST || DEFAULT_DEV_HOST;
// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],
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
