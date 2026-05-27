import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Keep strings/ and cover.jpg in the frontend build.
// Lua editor source resources are bundled through Tauri resources instead of the web build.

const luaFunctionBuildPath = resolve("build", "resources", "_functions.txt");
const luaDefinitionBuildPath = resolve("build", "resources", "def.lua");
const luaConstantBuildPath = resolve("build", "resources", "constant.lua");
const luaSnippetsBuildPath = resolve("build", "resources", "snippets.json");

await rm(luaFunctionBuildPath, { recursive: true, force: true });
await rm(luaDefinitionBuildPath, { recursive: true, force: true });
await rm(luaConstantBuildPath, { recursive: true, force: true });
await rm(luaSnippetsBuildPath, { recursive: true, force: true });
