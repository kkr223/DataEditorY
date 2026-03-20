import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { getBuildVariantConfig } from "./scripts/build-variant-config.mjs";

const host = globalThis.process?.env?.TAURI_DEV_HOST;
const variant = getBuildVariantConfig(globalThis.process?.env?.APP_VARIANT);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit()],
  define: {
    __APP_BUILD_VARIANT__: JSON.stringify(variant.key),
    __APP_BUILD_LABEL__: JSON.stringify(variant.label),
    __APP_FEATURES__: JSON.stringify(variant.features),
  },
  build: {
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      output: {
        /** @param {string} id */
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("node_modules/yugioh-card")) {
            return "vendor-yugioh-card";
          }

          if (id.includes("node_modules/cdb2yugiohcard")) {
            return "vendor-card-image";
          }

          if (id.includes("node_modules/@tauri-apps")) {
            return "vendor-tauri";
          }

          if (id.includes("node_modules/svelte-i18n")) {
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
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
