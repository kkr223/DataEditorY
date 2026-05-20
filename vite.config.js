import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath, URL } from "node:url";
import { getBuildVariantConfig } from "./scripts/build-variant-config.mjs";

const DEFAULT_DEV_HOST = "127.0.0.1";
const DEFAULT_DEV_PORT = 43127;
const DEFAULT_HMR_PORT = 43128;
const host = globalThis.process?.env?.TAURI_DEV_HOST || DEFAULT_DEV_HOST;
const variant = getBuildVariantConfig(globalThis.process?.env?.APP_VARIANT);

/**
 * @typedef {{ find: string; replacement: string }} BaseStubAlias
 */

/** @param {string} relativePath */
function filePath(relativePath) {
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

/**
 * @param {string} sourcePath
 * @returns {string[]}
 */
function aliasCandidates(sourcePath) {
  const sourceFsPath = filePath(`./src/lib/${sourcePath}`);
  const normalizedSourcePath = sourceFsPath.replaceAll("\\", "/");
  const candidates = new Set([
    `$lib/${sourcePath}`,
    sourceFsPath,
    normalizedSourcePath,
  ]);

  if (!sourcePath.endsWith(".svelte") && !sourcePath.endsWith(".ts")) {
    candidates.add(`${sourceFsPath}.ts`);
    candidates.add(`${normalizedSourcePath}.ts`);
  }

  return Array.from(candidates);
}

/**
 * @param {string} sourcePath
 * @param {string} stubPath
 * @returns {BaseStubAlias[]}
 */
function baseStubAliases(sourcePath, stubPath) {
  const replacement = filePath(stubPath);
  return aliasCandidates(sourcePath).map((find) => ({
    find,
    replacement,
  }));
}

/**
 * @param {BaseStubAlias[]} aliases
 * @returns {import("vite").Plugin}
 */
function baseStubAliasPlugin(aliases) {
  const replacements = new Map();

  for (const alias of aliases) {
    replacements.set(alias.find, alias.replacement);
    replacements.set(alias.find.replaceAll("\\", "/"), alias.replacement);
  }

  return {
    name: "dataeditory-base-stub-aliases",
    enforce: "pre",
    /** @param {string} source */
    resolveId(source) {
      const queryIndex = source.indexOf("?");
      const bareSource = queryIndex >= 0 ? source.slice(0, queryIndex) : source;
      const query = queryIndex >= 0 ? source.slice(queryIndex) : "";
      const replacement = replacements.get(bareSource) ?? replacements.get(bareSource.replaceAll("\\", "/"));

      if (!replacement) {
        return null;
      }

      return `${replacement}${query}`;
    },
  };
}

const baseExtraStubAliases = variant.key === "base"
  ? [
      ...baseStubAliases(
        "features/card-editor/extraUseCases",
        "./src/lib/build-stubs/base/features/card-editor/extraUseCases.ts",
      ),
      ...baseStubAliases(
        "features/card-editor/components/CardParseDialog.svelte",
        "./src/lib/build-stubs/base/features/card-editor/components/CardParseDialog.svelte",
      ),
      ...baseStubAliases(
        "features/card-editor/components/CardImageDrawerHost.svelte",
        "./src/lib/build-stubs/base/features/card-editor/components/CardImageDrawerHost.svelte",
      ),
      ...baseStubAliases(
        "features/script-editor/extraUseCases",
        "./src/lib/build-stubs/base/features/script-editor/extraUseCases.ts",
      ),
      ...baseStubAliases(
        "features/settings/extraUseCases",
        "./src/lib/build-stubs/base/features/settings/extraUseCases.ts",
      ),
      ...baseStubAliases(
        "features/settings/components/SettingsAiCard.svelte",
        "./src/lib/build-stubs/base/features/settings/components/SettingsAiCard.svelte",
      ),
    ]
  : [];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [baseStubAliasPlugin(baseExtraStubAliases), sveltekit()],
  resolve: {
    alias: baseExtraStubAliases,
  },
  define: {
    __APP_BUILD_VARIANT__: JSON.stringify(variant.key),
    __APP_BUILD_LABEL__: JSON.stringify(variant.label),
    __APP_FEATURES__: JSON.stringify(variant.features),
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
