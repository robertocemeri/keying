// Replaces the Electron.app bundle's icon with Keying's so the macOS Dock
// shows the right icon in dev mode. `app.dock.setIcon()` is a runtime override
// that macOS resyncs away at unpredictable moments; swapping the actual
// bundle resource is the only way to make it stick.
//
// Idempotent: skips work if the bundle icon is already Keying's. Safe to run
// repeatedly. Re-run after `npm install` if needed (the dependency reinstalls
// Electron's original icon).

import { createHash } from "node:crypto";
import { readFile, copyFile, utimes, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const SOURCE = path.join(projectRoot, "build", "icon.icns");
const TARGET = path.join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
  "Contents",
  "Resources",
  "electron.icns",
);

if (process.platform !== "darwin") {
  process.exit(0);
}

if (!existsSync(SOURCE)) {
  console.warn(`[dev-icon] source missing: ${SOURCE} — skipping`);
  process.exit(0);
}

if (!existsSync(TARGET)) {
  console.warn(`[dev-icon] target missing: ${TARGET} — run npm install first`);
  process.exit(0);
}

async function sha256(p) {
  const data = await readFile(p);
  return createHash("sha256").update(data).digest("hex");
}

const [srcHash, dstHash] = await Promise.all([sha256(SOURCE), sha256(TARGET)]);

if (srcHash === dstHash) {
  process.exit(0);
}

await copyFile(SOURCE, TARGET);

// Bump mtime on the .app bundle so macOS invalidates its Launch Services /
// Icon Services cache for this bundle on the next launch.
const bundlePath = path.join(
  projectRoot,
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
);
const now = new Date();
try {
  await utimes(bundlePath, now, now);
  const contents = path.join(bundlePath, "Contents");
  await utimes(contents, now, now);
  await utimes(path.join(contents, "Info.plist"), now, now);
} catch {
  /* best-effort */
}

const targetStat = await stat(TARGET);
console.log(
  `[dev-icon] replaced Electron.app icon (${targetStat.size} bytes). ` +
    `If macOS still shows the old icon, run: killall Dock`,
);
