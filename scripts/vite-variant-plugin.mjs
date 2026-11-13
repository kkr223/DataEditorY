import { fileURLToPath } from "node:url";
import { getBuildVariantConfig } from "./build-variant-config.mjs";

const fromRoot = (/** @type {string} */ path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const normalizeId = (/** @type {string} */ id) => id.split("?")[0].replaceAll("\\", "/").toLowerCase();

const ACTIVE_MODULES_PATH = fromRoot("src/lib/modules/active.ts");

/** Source files swapped for the web variant. */
export const WEB_VARIANT_ALIASES = {
  "src/lib/platform/host/index.ts": "src/lib/platform/host/web.ts",
  "src/lib/platform/transport/active.ts": "src/lib/platform/transport/worker.ts",
};

/**
 * Points `src/lib/modules/active.ts` at the variant entry selected by
 * APP_VARIANT, so builds never rewrite tracked source files. Extra aliases are
 * root-relative source paths mapped to their replacements.
 * @param {{ variant?: string, aliases?: Record<string, string> }} [options]
 * @returns {import("vite").Plugin}
 */
export function variantModulesPlugin(options = {}) {
  const variant = getBuildVariantConfig(options.variant);
  const activeId = normalizeId(ACTIVE_MODULES_PATH);
  const variantEntry = fromRoot(`src/lib/modules/${variant.key}.ts`);
  const aliasTable = {
    ...(variant.key === "web" ? WEB_VARIANT_ALIASES : {}),
    ...(options.aliases ?? {}),
  };
  const aliases = new Map(
    Object.entries(aliasTable).map(([from, to]) => [normalizeId(fromRoot(from)), fromRoot(to)]),
  );
  return {
    name: "dey-variant-modules",
    enforce: "pre",
    async resolveId(source, importer, resolveOptions) {
      if (!source.includes("active") && aliases.size === 0) return null;
      const resolved = await this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
      if (!resolved) return null;
      const resolvedId = normalizeId(resolved.id);
      if (resolvedId === activeId) return variantEntry;
      return aliases.get(resolvedId) ?? null;
    },
  };
}
