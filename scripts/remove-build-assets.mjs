import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Keep strings.conf and cover.jpg in the frontend build.
// Lua editor source resources and yugioh-card assets are bundled through Tauri resources instead of the web build.

const yugiohCardBuildPath = resolve("build", "resources", "yugioh-card");
const luaFunctionBuildPath = resolve("build", "resources", "_functions.txt");
const luaConstantBuildPath = resolve("build", "resources", "constant.lua");
const luaSnippetsBuildPath = resolve("build", "resources", "snippets.json");

await rm(yugiohCardBuildPath, { recursive: true, force: true });
await rm(luaFunctionBuildPath, { recursive: true, force: true });
await rm(luaConstantBuildPath, { recursive: true, force: true });
await rm(luaSnippetsBuildPath, { recursive: true, force: true });
