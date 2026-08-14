import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const sourceRoot = resolve("static", "resources");
const targetRoot = resolve("build", "resources");
const browserAssets = ["ai-prompts", "ai-skills", "cover.jpg", "strings"];

await mkdir(targetRoot, { recursive: true });
await Promise.all(browserAssets.map((asset) => cp(
  resolve(sourceRoot, asset),
  resolve(targetRoot, asset),
  { recursive: true },
)));
