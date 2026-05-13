// Bumps the patch version in both package.json and extension/manifest.json
// in lockstep, then prints the new version. Run before npm run release so
// the auto-updater sees a fresh version.
//
// Usage:  node scripts/bump-version.mjs [patch|minor|major]
// Default bump: patch

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const PKG = join(root, "package.json");
const MANIFEST = join(root, "extension", "manifest.json");

const kind = process.argv[2] || "patch";
if (!["patch", "minor", "major"].includes(kind)) {
  console.error(`Unknown bump kind: ${kind}. Use patch|minor|major.`);
  process.exit(1);
}

function bumpSemver(v, kind) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Not a semver string: ${v}`);
  let [, major, minor, patch] = m.map(Number);
  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

async function bumpJsonFile(path, kind) {
  const raw = await readFile(path, "utf8");
  const obj = JSON.parse(raw);
  const next = bumpSemver(obj.version, kind);
  // Preserve formatting: replace just the version line, don't reserialize.
  const replaced = raw.replace(
    /("version"\s*:\s*)"[^"]+"/,
    `$1"${next}"`,
  );
  if (replaced === raw) {
    throw new Error(`Couldn't find a "version" field to replace in ${path}`);
  }
  await writeFile(path, replaced);
  return next;
}

const newAppVersion = await bumpJsonFile(PKG, kind);
const newExtVersion = await bumpJsonFile(MANIFEST, kind);

if (newAppVersion !== newExtVersion) {
  console.warn(
    `[bump-version] versions diverged after bump: app=${newAppVersion}, ext=${newExtVersion}`,
  );
}

console.log(`Bumped to ${newAppVersion}`);
