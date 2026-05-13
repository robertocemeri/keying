// Renders store-listing promo tile SVGs to PNGs at the exact pixel
// dimensions Chrome Web Store requires. Run with: npm run promos:build

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const promosDir = join(root, "store-listing", "promos");

const targets = [
  { src: "promo-small.svg", out: "promo-small-440x280.png", width: 440 },
  { src: "promo-marquee.svg", out: "promo-marquee-1400x560.png", width: 1400 },
];

for (const t of targets) {
  const svgPath = join(promosDir, t.src);
  if (!existsSync(svgPath)) {
    console.warn(`skipping missing source: ${svgPath}`);
    continue;
  }
  const svg = await readFile(svgPath);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: t.width },
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  const outPath = join(promosDir, t.out);
  await writeFile(outPath, png);
  console.log(`wrote ${outPath} (${png.length} bytes)`);
}

// Store icon: Chrome wants 128x128 PNG. Reuse the app icon we already built.
const storeIconSrc = join(root, "build", "icon-128.png");
const storeIconDst = join(promosDir, "store-icon-128x128.png");
if (existsSync(storeIconSrc)) {
  await copyFile(storeIconSrc, storeIconDst);
  console.log(`wrote ${storeIconDst} (copied from build/icon-128.png)`);
}
