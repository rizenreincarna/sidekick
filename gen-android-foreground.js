const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SRC = path.join(__dirname, "Sidekick.png");
const DRAWABLE = path.join(__dirname, "android-app", "app", "src", "main", "res", "drawable");

// Adaptive foreground: 108dp viewport. At xxxhdpi (4x) = 432px.
// Safe zone is the inner 66% (~72dp), so pad ~17% on each side.
(async () => {
  const size = 432;
  const pad = size * 0.17;
  const inner = size - pad * 2;
  const b64 = fs.readFileSync(SRC).toString("base64");
  const svg = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image href="data:image/png;base64,${b64}" x="${pad}" y="${pad}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  fs.mkdirSync(DRAWABLE, { recursive: true });
  await sharp(Buffer.from(svg), { density: 300 }).png().toFile(path.join(DRAWABLE, "ic_launcher_foreground.png"));
  console.log("wrote drawable/ic_launcher_foreground.png (432x432 transparent)");

  // Also write per-density foreground PNGs to drawable-* dirs so all densities get a crisp icon.
  const densities = [
    ["drawable-mdpi", 108],
    ["drawable-hdpi", 162],
    ["drawable-xhdpi", 216],
    ["drawable-xxhdpi", 324],
    ["drawable-xxxhdpi", 432],
  ];
  for (const [dir, s] of densities) {
    const p = s * 0.17;
    const i = s - p * 2;
    const dsvg = `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <image href="data:image/png;base64,${b64}" x="${p}" y="${p}" width="${i}" height="${i}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
    const outDir = path.join(__dirname, "android-app", "app", "src", "main", "res", dir);
    fs.mkdirSync(outDir, { recursive: true });
    await sharp(Buffer.from(dsvg), { density: 300 }).png().toFile(path.join(outDir, "ic_launcher_foreground.png"));
    console.log(`wrote ${dir}/ic_launcher_foreground.png (${s}px)`);
  }
  console.log("done");
})();