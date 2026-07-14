const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SRC = path.join(__dirname, "Sidekick.png");
const PUBLIC = path.join(__dirname, "public");

// Generate favicons + a header logo PNG from Sidekick.png.
(async () => {
  // favicon.ico (multi-size) — sharp can't write .ico directly, so emit a 32px png
  // and we'll reference logo.svg/png as the icon in metadata instead.
  const sizes = [
    ["favicon-16x16.png", 16],
    ["favicon-32x32.png", 32],
    ["favicon-48x48.png", 48],
    ["android-chrome-192x192.png", 192],
    ["apple-touch-icon.png", 180],
    ["logo.png", 512],     // general-use logo
    ["icon-512.png", 512], // PWA/icon
  ];

  for (const [name, size] of sizes) {
    const out = path.join(PUBLIC, name);
    await sharp(SRC, { density: 300 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log(`wrote public/${name} (${size}px)`);
  }
  console.log("done");
})();