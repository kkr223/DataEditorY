import { rm } from "node:fs/promises";
import { resolve } from "node:path";

// Keep strings.conf and cover.jpg in the frontend build.
// yugioh-card assets are bundled through Tauri resources instead of the web build.

const yugiohCardBuildPath = resolve("build", "resources", "yugioh-card");

await rm(yugiohCardBuildPath, { recursive: true, force: true });
