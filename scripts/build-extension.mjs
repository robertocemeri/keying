#!/usr/bin/env node
// Build a Chrome Web Store / Firefox Add-ons -ready zip of the extension.
// Usage: npm run extension:zip → writes release/keying-extension.zip

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const extDir = join(root, "extension");
const outDir = join(root, "release");
const zipPath = join(outDir, "keying-extension.zip");

if (!existsSync(extDir)) {
  console.error("extension/ directory not found at", extDir);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// Use the system `zip` (preinstalled on macOS). -r recurse, -X strip extra
// attributes (macOS adds .DS_Store + extended attrs), -q quiet.
const result = spawnSync(
  "zip",
  ["-rqX", zipPath, ".", "-x", "*.DS_Store", "-x", "__MACOSX/*"],
  { cwd: extDir, stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("zip failed");
  process.exit(result.status ?? 1);
}

console.log("Built", zipPath);
